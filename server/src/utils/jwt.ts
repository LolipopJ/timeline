import jwt, { type Jwt, type JwtPayload } from "jsonwebtoken";

export class JWT {
  secretKey = "";
  verifiedTokenCache: Record<string, Jwt | JwtPayload | string | undefined> =
    {};

  constructor(secretKey: string) {
    this.secretKey = secretKey;
  }

  sign(record: string | Buffer | object, options?: jwt.SignOptions) {
    const token = jwt.sign(record, this.secretKey, {
      algorithm: "HS256",
      ...options,
    });
    return token;
  }

  verify(token: string, options?: jwt.VerifyOptions) {
    const decodedCache = this.verifiedTokenCache[token];
    const decoded =
      decodedCache ??
      jwt.verify(token, this.secretKey, {
        algorithms: ["HS256"],
        ...options,
      });

    if (!decodedCache) {
      this.verifiedTokenCache[token] = decoded;
      setTimeout(
        () => {
          delete this.verifiedTokenCache[token];
        },
        1000 * 60 * 60 * 24,
      );
    }

    return decoded;
  }
}
