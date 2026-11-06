"""One read-only Xbox collection operation over stdin/stdout JSON.

OAuth refresh is the only external write. Bun owns game state and milestones.
"""

import asyncio
import contextlib
from datetime import datetime, timezone
import hashlib
import io
import json
import logging
import os
from pathlib import Path
import re
import sys
import tempfile

try:
    import httpx
    from pydantic import ValidationError
    from xbox.webapi.api.client import XboxLiveClient
    from xbox.webapi.api.provider.titlehub.models import TitleFields
    from xbox.webapi.authentication.manager import AuthenticationManager
    from xbox.webapi.authentication.models import OAuth2TokenResponse
    from xbox.webapi.common.signed_session import SignedSession
except ImportError:
    if __name__ != "__main__":
        raise
    print(json.dumps({"code": "XBOX_ENVIRONMENT_UNAVAILABLE"}), file=sys.stderr)
    sys.exit(1)


class CollectorError(Exception):
    """An error code safe to cross the subprocess boundary."""


def auth_failure(error):
    if isinstance(error, httpx.HTTPStatusError):
        if error.response.status_code == 429:
            return CollectorError("XBOX_RATE_LIMIT")
        if error.response.status_code >= 500:
            return CollectorError("XBOX_REQUEST_FAILED")
    if isinstance(error, httpx.RequestError):
        return CollectorError("XBOX_REQUEST_FAILED")
    return CollectorError("XBOX_AUTH_REQUIRED")


def timestamp(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None or parsed <= datetime(1970, 1, 1, tzinfo=timezone.utc):
            return None
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except (ValueError, OverflowError):
        return None


async def read_pages(session, url, headers, params, key):
    """Keep raw paging metadata which the convenience providers do not expose.

    Requests still go through XboxLiveClient.session for library-managed auth.
    """
    rows, seen_tokens, continuation, expected = [], set(), None, None
    while True:
        query = {**params, "maxItems": 100}
        if continuation:
            query["continuationToken"] = continuation
        for attempt in range(3):
            response = await session.get(url, headers=dict(headers), params=query)
            if response.status_code != 429 and response.status_code < 500:
                break
            if attempt == 2:
                raise CollectorError("XBOX_RATE_LIMIT" if response.status_code == 429 else "XBOX_REQUEST_FAILED")
            await asyncio.sleep(0.5 * (2 ** attempt))
        if response.status_code != 200:
            raise CollectorError("XBOX_REQUEST_FAILED")
        data = response.json()
        if not isinstance(data, dict) or not isinstance(data.get(key), list):
            raise CollectorError("XBOX_INCOMPLETE_RESPONSE")
        paging = data.get("pagingInfo")
        if not isinstance(paging, dict):
            raise CollectorError("XBOX_INCOMPLETE_RESPONSE")
        total = paging.get("totalRecords")
        if type(total) is not int or total < 0 or (expected is not None and total != expected):
            raise CollectorError("XBOX_INCOMPLETE_RESPONSE")
        expected = total
        rows.extend(data[key])
        continuation = paging.get("continuationToken")
        if not continuation:
            if len(rows) != expected:
                raise CollectorError("XBOX_INCOMPLETE_RESPONSE")
            return rows
        if not isinstance(continuation, str) or continuation in seen_tokens or not data[key]:
            raise CollectorError("XBOX_INCOMPLETE_RESPONSE")
        seen_tokens.add(continuation)


def normalize_modern(rows):
    result = []
    for row in rows:
        if not isinstance(row, dict):
            raise CollectorError("XBOX_INCOMPLETE_RESPONSE")
        if row.get("achievementType") == "Challenge" or row.get("isRevoked") is True or row.get("isArchived") is True:
            continue
        if row.get("achievementType") != "Persistent" or not isinstance(row.get("id"), str) or not isinstance(row.get("serviceConfigId"), str):
            raise CollectorError("XBOX_INCOMPLETE_RESPONSE")
        if row.get("progressState") not in ("Achieved", "NotStarted", "InProgress"):
            raise CollectorError("XBOX_INCOMPLETE_RESPONSE")
        achievement = {"id": f'{row["serviceConfigId"]}:{row["id"]}', "unlocked": row["progressState"] == "Achieved"}
        unlocked_at = timestamp((row.get("progression") or {}).get("timeUnlocked"))
        if achievement["unlocked"] and unlocked_at:
            achievement["unlockedAt"] = unlocked_at
        result.append(achievement)
    if len({item["id"] for item in result}) != len(result):
        raise CollectorError("XBOX_INCOMPLETE_RESPONSE")
    return result


def normalize_legacy(rows):
    result = []
    for row in rows:
        if not isinstance(row, dict):
            raise CollectorError("XBOX_INCOMPLETE_RESPONSE")
        if row.get("isRevoked") is True or row.get("isArchived") is True:
            continue
        if type(row.get("id")) is not int or type(row.get("unlocked")) is not bool:
            raise CollectorError("XBOX_INCOMPLETE_RESPONSE")
        achievement = {"id": str(row["id"]), "unlocked": row["unlocked"]}
        unlocked_at = timestamp(row.get("timeUnlocked"))
        if achievement["unlocked"] and unlocked_at:
            achievement["unlockedAt"] = unlocked_at
        result.append(achievement)
    if len({item["id"] for item in result}) != len(result):
        raise CollectorError("XBOX_INCOMPLETE_RESPONSE")
    return result


async def collect_summaries(client, xuid):
    provider = client.achievements
    result = []
    # Both history API families have continuationToken and totalRecords. Titlehub's
    # five-title convenience view cannot establish a complete historical catalog.
    for family, headers in (("xboxone", provider.HEADERS_GAME_PROGRESS),
                            ("xbox360", provider.HEADERS_GAME_360_PROGRESS)):
        rows = await read_pages(client.session,
                                f"{provider.ACHIEVEMENTS_URL}/users/xuid({xuid})/history/titles",
                                headers, {}, "titles")
        ids = set()
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("name"), str):
                raise CollectorError("XBOX_INCOMPLETE_RESPONSE")
            title_id = str(row.get("titleId", ""))
            if not re.fullmatch(r"[0-9]+", title_id) or title_id in ids:
                raise CollectorError("XBOX_INCOMPLETE_RESPONSE")
            ids.add(title_id)
            # Fingerprint all light history fields, including unlock counts and
            # service/definition versions, without relying on Gamerscore equality.
            signature = hashlib.sha256(json.dumps(row, sort_keys=True).encode()).hexdigest()
            result.append({"gameId": f"{family}:{title_id}", "title": row["name"],
                           "signature": signature})
    return {"xuid": xuid, "summaries": result}


async def collect_details(client, xuid, games):
    result = []
    provider = client.achievements
    for game in games:
        match = re.fullmatch(r"(xboxone|xbox360):([0-9]+)", game["gameId"])
        if not match:
            raise CollectorError("XBOX_INVALID_REQUEST")
        family, title_id = match.groups()
        legacy = family == "xbox360"
        headers = provider.HEADERS_GAME_360_PROGRESS if legacy else provider.HEADERS_GAME_PROGRESS
        path = "titleachievements" if legacy else "achievements"
        rows = await read_pages(client.session,
                                f"{provider.ACHIEVEMENTS_URL}/users/xuid({xuid})/{path}",
                                headers, {"titleId": title_id}, "achievements")
        normalized = {"gameId": game["gameId"], "title": game["title"],
                      "achievements": normalize_legacy(rows) if legacy else normalize_modern(rows)}
        try:
            info = await client.titlehub.get_title_info(title_id, fields=[TitleFields.IMAGE])
        except httpx.HTTPStatusError as error:
            if error.response.status_code != 404:
                raise
        except ValidationError:
            # Titlehub's model requires image metadata even for titles without a cover.
            pass
        else:
            for title in info.titles:
                if str(title.title_id) == title_id and title.display_image:
                    normalized["coverUrl"] = title.display_image
                    break
        # xbox-webapi 2.1.0 exposes no verified Mythic/base-set identity. Do not
        # infer one from gamerscore, names, first observations or completion badges.
        result.append(normalized)
    return {"games": result}


def save_oauth(path, oauth):
    fd, temporary = tempfile.mkstemp(prefix=".xbox-oauth-", suffix=".json", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as output:
            output.write(oauth.model_dump_json())
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


async def run(request):
    if not isinstance(request, dict) or request.get("operation") not in ("summaries", "details"):
        raise CollectorError("XBOX_INVALID_REQUEST")
    operation = request["operation"]
    xuid = request.get("xuid")
    if (xuid is not None or operation == "details") and (
            not isinstance(xuid, str) or not re.fullmatch(r"[0-9]+", xuid)):
        raise CollectorError("XBOX_INVALID_REQUEST")
    if any(not isinstance(request.get(key), str) or not request[key] for key in ("clientId", "clientSecret", "tokenStorePath")):
        raise CollectorError("XBOX_AUTH_REQUIRED")
    path = Path(request["tokenStorePath"])
    if not path.is_absolute():
        raise CollectorError("XBOX_AUTH_REQUIRED")
    try:
        # Match Bun's realpath session lock. Replacing a symlink itself would
        # split one shared OAuth session into two independently refreshed files.
        path = path.resolve(strict=True)
        oauth = OAuth2TokenResponse.model_validate_json(path.read_text(encoding="utf-8"))
        if not oauth.refresh_token or not oauth.issued.tzinfo:
            raise ValueError("Invalid persisted OAuth session")
    except (OSError, ValueError, RuntimeError):
        raise CollectorError("XBOX_AUTH_REQUIRED") from None
    games = request.get("games")
    if operation == "details":
        if not isinstance(games, list) or any(not isinstance(game, dict) or
                not isinstance(game.get("gameId"), str) or not isinstance(game.get("title"), str) for game in games):
            raise CollectorError("XBOX_INVALID_REQUEST")
        if len({game["gameId"] for game in games}) != len(games):
            raise CollectorError("XBOX_INVALID_REQUEST")
    async with SignedSession() as session:
        auth = AuthenticationManager(session, request["clientId"], request["clientSecret"], "")
        auth.oauth = oauth
        try:
            # Force the OAuth refresh grant even for an unexpired access token:
            # this verifies the session belongs to the configured application.
            auth.oauth = await auth.refresh_oauth_token()
        except Exception as error:
            raise auth_failure(error) from None
        save_oauth(path, auth.oauth)
        try:
            await auth.refresh_tokens()
        except Exception as error:
            raise auth_failure(error) from None
        client = XboxLiveClient(auth)
        try:
            if operation == "summaries":
                if xuid is None:
                    xuid = client.xuid
                    if not re.fullmatch(r"[0-9]+", xuid):
                        raise CollectorError("XBOX_INCOMPLETE_RESPONSE")
                return await collect_summaries(client, xuid)
            return await collect_details(client, xuid, games)
        finally:
            # XboxLiveClient may refresh OAuth again during a long batch. Keep
            # that successful refresh even when a later title/page fails.
            save_oauth(path, auth.oauth)


def main():
    logging.disable(logging.CRITICAL)
    try:
        # AuthenticationManager contains an upstream stdout print on failure.
        # Suppress it so partial library output can never corrupt the protocol.
        with contextlib.redirect_stdout(io.StringIO()):
            request = json.load(sys.stdin)
            result = asyncio.run(run(request))
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        return 0
    except CollectorError as error:
        messages = {"XBOX_AUTH_REQUIRED": "Reauthorize OAuth with the configured application.",
                    "XBOX_INVALID_REQUEST": "Invalid collector request.",
                    "XBOX_INCOMPLETE_RESPONSE": "Incomplete Xbox response; no checkpoint was advanced.",
                    "XBOX_RATE_LIMIT": "Xbox rate limit exhausted; retry later.",
                    "XBOX_REQUEST_FAILED": "Xbox request failed; check account visibility and retry."}
        code = str(error)
        print(json.dumps({"code": code, "message": messages.get(code, "Xbox collection failed.")}), file=sys.stderr)
        return 1
    except Exception:
        print(json.dumps({"code": "XBOX_COLLECTION_FAILED", "message": "Xbox collection failed; no checkpoint was advanced."}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main())
