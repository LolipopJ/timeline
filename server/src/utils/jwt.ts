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
      // `unref()` 保证该定时器不会阻止进程退出；管理员登录一次后它会存活 24 小时
      setTimeout(
        () => {
          delete this.verifiedTokenCache[token];
        },
        1000 * 60 * 60 * 24,
      ).unref();
    }

    return decoded;
  }
}
