import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

import xbox_collector as collector


class Response:
    def __init__(self, value, status=200):
        self.value, self.status_code = value, status

    def json(self):
        return self.value


class Pages:
    def __init__(self, values):
        self.get = AsyncMock(side_effect=[Response(value) for value in values])


def page(rows, token=None, total=None, key="achievements"):
    return {key: rows, "pagingInfo": {"continuationToken": token,
                                    "totalRecords": len(rows) if total is None else total}}


class CollectorTests(unittest.IsolatedAsyncioTestCase):
    async def test_pagination_consumes_more_than_default_five_and_all_detail_pages(self):
        for key in ("titles", "achievements"):
            session = Pages([page(list(range(6)), "next", 8, key),
                             page([6, 7], None, 8, key)])
            rows = await collector.read_pages(session, "https://example.test", {}, {}, key)
            self.assertEqual(rows, list(range(8)))
            self.assertEqual(session.get.call_args_list[1].kwargs["params"]["continuationToken"], "next")

    async def test_partial_or_cyclic_pagination_fails(self):
        for values in ([page([1], None, 2)],
                       [page([1], "same", 2), page([2], "same", 2)],
                       [page([1], "next", 2), {"error": "private data"}]):
            with self.assertRaises(collector.CollectorError):
                await collector.read_pages(Pages(values), "url", {}, {}, "achievements")

    async def test_rate_limit_is_bounded_and_does_not_return_partial_data(self):
        session = Pages([])
        session.get = AsyncMock(return_value=Response({}, 429))
        with patch.object(collector.asyncio, "sleep", new=AsyncMock()):
            with self.assertRaisesRegex(collector.CollectorError, "XBOX_RATE_LIMIT"):
                await collector.read_pages(session, "url", {}, {}, "achievements")
        self.assertEqual(session.get.await_count, 3)

    def test_modern_filters_challenges_revoked_and_omits_placeholder_times(self):
        rows = [{"id": "1", "serviceConfigId": "scid", "achievementType": "Persistent",
                 "progressState": "Achieved", "progression": {"timeUnlocked": "0001-01-01T00:00:00Z"}},
                {"id": "2", "serviceConfigId": "scid", "achievementType": "Challenge"},
                {"id": "3", "serviceConfigId": "scid", "achievementType": "Persistent", "isRevoked": True}]
        self.assertEqual(collector.normalize_modern(rows), [{"id": "scid:1", "unlocked": True}])
        self.assertEqual(collector.normalize_modern([]), [])
        self.assertIsNone(collector.timestamp("9999-12-31T23:59:59-01:00"))

    def test_legacy_uses_unlock_flag_and_actual_date_not_score(self):
        result = collector.normalize_legacy([
            {"id": 1, "unlocked": True, "timeUnlocked": "2020-03-02T01:02:03Z", "gamerscore": 0},
            {"id": 2, "unlocked": False, "timeUnlocked": None, "gamerscore": 1000},
        ])
        self.assertEqual(result[0]["unlockedAt"], "2020-03-02T01:02:03Z")
        self.assertFalse(result[1]["unlocked"])
        self.assertNotIn("unlockedAt", result[1])

    async def test_refreshed_oauth_is_saved_before_platform_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "tokens.json"
            target.write_text(json.dumps({"token_type": "bearer", "expires_in": 3600,
                                         "scope": "Xboxlive.signin", "access_token": "old",
                                         "refresh_token": "refresh", "user_id": "user"}))
            auth = AsyncMock()
            oauth = collector.OAuth2TokenResponse.model_validate_json(target.read_text())
            oauth.access_token = "refreshed"
            auth.refresh_oauth_token.return_value = oauth
            auth.refresh_tokens.side_effect = RuntimeError("token=must-not-leak")
            with patch.object(collector, "SignedSession", return_value=AsyncMock()), \
                    patch.object(collector, "AuthenticationManager", return_value=auth):
                with self.assertRaises(collector.CollectorError):
                    await collector.run({"operation": "summaries", "xuid": "123", "clientId": "app",
                                         "clientSecret": "secret", "tokenStorePath": str(target)})
            self.assertEqual(json.loads(target.read_text())["access_token"], "refreshed")
            self.assertEqual(list(Path(directory).iterdir()), [target])

    async def test_session_symlink_is_retained_and_real_target_is_refreshed(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "tokens.json"
            alias = Path(directory) / "tokens-link.json"
            target.write_text(json.dumps({"token_type": "bearer", "expires_in": 3600,
                                         "scope": "Xboxlive.signin", "access_token": "old",
                                         "refresh_token": "refresh", "user_id": "user"}))
            try:
                alias.symlink_to(target.name)
            except OSError as error:
                if os.name == "nt" and error.winerror == 1314:
                    self.skipTest("Windows symlink privilege is unavailable")
                raise
            auth = AsyncMock()
            oauth = collector.OAuth2TokenResponse.model_validate_json(target.read_text())
            oauth.access_token = "refreshed"
            auth.refresh_oauth_token.return_value = oauth
            auth.refresh_tokens.side_effect = RuntimeError("stop before platform requests")
            with patch.object(collector, "SignedSession", return_value=AsyncMock()), \
                    patch.object(collector, "AuthenticationManager", return_value=auth):
                with self.assertRaises(collector.CollectorError):
                    await collector.run({"operation": "summaries", "xuid": "123", "clientId": "app",
                                         "clientSecret": "secret", "tokenStorePath": str(alias)})
            self.assertTrue(alias.is_symlink())
            self.assertEqual(json.loads(target.read_text())["access_token"], "refreshed")
            self.assertEqual(alias.read_text(), target.read_text())
            self.assertEqual(set(Path(directory).iterdir()), {target, alias})

    async def test_mismatched_application_requires_reauthorization(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "tokens.json"
            original = json.dumps({"token_type": "bearer", "expires_in": 3600,
                                   "scope": "Xboxlive.signin", "access_token": "old",
                                   "refresh_token": "refresh", "user_id": "user"})
            target.write_text(original)
            auth = AsyncMock()
            auth.refresh_oauth_token.side_effect = RuntimeError("client_secret=secret")
            with patch.object(collector, "SignedSession", return_value=AsyncMock()), \
                    patch.object(collector, "AuthenticationManager", return_value=auth):
                with self.assertRaisesRegex(collector.CollectorError, "XBOX_AUTH_REQUIRED"):
                    await collector.run({"operation": "summaries", "xuid": "123", "clientId": "wrong",
                                         "clientSecret": "secret", "tokenStorePath": str(target)})
            self.assertEqual(target.read_text(), original)

    def test_transient_auth_failures_do_not_request_reauthorization(self):
        request = collector.httpx.Request("POST", "https://example.test/oauth")
        for status, expected in ((429, "XBOX_RATE_LIMIT"), (503, "XBOX_REQUEST_FAILED"),
                                 (400, "XBOX_AUTH_REQUIRED")):
            error = collector.httpx.HTTPStatusError("sensitive body", request=request,
                                                    response=collector.httpx.Response(status))
            self.assertEqual(str(collector.auth_failure(error)), expected)
        self.assertEqual(str(collector.auth_failure(collector.httpx.ReadTimeout("private"))),
                         "XBOX_REQUEST_FAILED")

    def test_cli_never_prints_raw_exceptions_or_upstream_stdout(self):
        output, error = io.StringIO(), io.StringIO()
        def failed(_):
            _.close()
            print("upstream-secret")
            raise RuntimeError("access_token=private")
        with patch.object(collector.sys, "stdin", io.StringIO('{"operation":"summaries"}')):
            with patch.object(collector.asyncio, "run", side_effect=failed):
                with contextlib.redirect_stdout(output), contextlib.redirect_stderr(error):
                    code = collector.main()
        self.assertEqual(code, 1)
        self.assertEqual(output.getvalue(), "")
        self.assertNotIn("private", error.getvalue())
        self.assertNotIn("secret", error.getvalue())

    def test_cli_reports_missing_dependencies(self):
        result = subprocess.run(
            [sys.executable, "-S", collector.__file__],
            input="{}", capture_output=True, text=True, timeout=10,
        )
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertEqual(json.loads(result.stderr)["code"], "XBOX_ENVIRONMENT_UNAVAILABLE")

    async def test_catalog_and_both_detail_families_have_no_base_guess(self):
        headers = {"x-xbl-contract-version": "2"}
        legacy_headers = {"x-xbl-contract-version": "1"}
        provider = SimpleNamespace(ACHIEVEMENTS_URL="https://example.test",
                                   HEADERS_GAME_PROGRESS=headers,
                                   HEADERS_GAME_360_PROGRESS=legacy_headers)
        titles = [{"titleId": index, "name": "Same Game", "earnedAchievements": index}
                  for index in range(1, 8)]
        session = Pages([page(titles[:6], "more", 7, "titles"),
                         page(titles[6:], None, 7, "titles"),
                         page([titles[0]], None, 1, "titles")])
        client = SimpleNamespace(session=session, achievements=provider)
        summaries = (await collector.collect_summaries(client, "123"))["summaries"]
        self.assertEqual(len(summaries), 8)
        self.assertNotEqual(summaries[0]["gameId"], summaries[-1]["gameId"])
        self.assertTrue(all("url" not in summary for summary in summaries))
        cover_request = collector.httpx.Request("GET", "https://example.test/cover")
        client.titlehub = SimpleNamespace(get_title_info=AsyncMock(side_effect=[
            SimpleNamespace(titles=[
                SimpleNamespace(title_id="1", display_image="https://example.test/cover.jpg"),
            ]),
            collector.httpx.HTTPStatusError("Missing cover", request=cover_request,
                                            response=collector.httpx.Response(404)),
        ]))
        client.session = Pages([
            page([{"id": "a", "serviceConfigId": "scid", "achievementType": "Persistent",
                   "progressState": "Achieved", "progression": {"timeUnlocked": "2020-01-01T00:00:00Z"}}], "more", 2),
            page([{"id": "b", "serviceConfigId": "scid", "achievementType": "Persistent",
                   "progressState": "InProgress"}], None, 2),
            page([{"id": 1, "unlocked": True, "timeUnlocked": "2020-01-01T00:00:00Z"}], None, 1),
        ])
        games = (await collector.collect_details(client, "123", [summaries[0], summaries[-1]]))["games"]
        self.assertEqual([len(game["achievements"]) for game in games], [2, 1])
        self.assertTrue(all("base" not in game for game in games))
        self.assertEqual(games[0]["coverUrl"], "https://example.test/cover.jpg")
        self.assertNotIn("coverUrl", games[1])

    async def test_catalog_defaults_to_the_authenticated_xuid(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "tokens.json"
            target.write_text(json.dumps({"token_type": "bearer", "expires_in": 3600,
                                         "scope": "Xboxlive.signin", "access_token": "old",
                                         "refresh_token": "refresh", "user_id": "user"}))
            auth = AsyncMock()
            auth.refresh_oauth_token.return_value = collector.OAuth2TokenResponse.model_validate_json(target.read_text())
            auth.xsts_token = SimpleNamespace(xuid="9007199254740993", authorization_header_value="test")
            auth.session.request = AsyncMock(return_value=Response(page([], key="titles")))
            with patch.object(collector, "SignedSession", return_value=AsyncMock()), \
                    patch.object(collector, "AuthenticationManager", return_value=auth):
                result = await collector.run({"operation": "summaries", "clientId": "app",
                                              "clientSecret": "secret", "tokenStorePath": str(target)})
            self.assertEqual(result, {"xuid": "9007199254740993", "summaries": []})
            self.assertIn("/users/xuid(9007199254740993)/", auth.session.request.await_args.args[1])

    async def test_invalid_or_other_session_format_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tokens.json"
            path.write_text('{"tokens":{"accessToken":"private"}}')
            with self.assertRaisesRegex(collector.CollectorError, "XBOX_AUTH_REQUIRED"):
                await collector.run({"operation": "summaries", "xuid": "123", "clientId": "app",
                                     "clientSecret": "secret", "tokenStorePath": str(path)})

    async def test_missing_and_invalid_session_paths_are_sanitized(self):
        with tempfile.TemporaryDirectory() as directory:
            for value in (str(Path(directory) / "missing.json"), str(Path(directory)) + "\x00"):
                with self.assertRaises(collector.CollectorError) as raised:
                    await collector.run({"operation": "summaries", "xuid": "123", "clientId": "app",
                                         "clientSecret": "secret", "tokenStorePath": value})
                self.assertEqual(str(raised.exception), "XBOX_AUTH_REQUIRED")


if __name__ == "__main__":
    unittest.main()
