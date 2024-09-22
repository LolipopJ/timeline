import jwt from "jsonwebtoken";

export class JWT {
  #secretKey = "";

  constructor(secretKey: string) {
    this.#secretKey = secretKey;
  }

  sign(record: string | Buffer | object, options?: jwt.SignOptions) {
    const token = jwt.sign(record, this.#secretKey, {
      algorithm: "RS256",
      ...options,
    });
    return token;
  }

  verify(token: string, options?: jwt.VerifyOptions) {
    const decoded = jwt.verify(token, this.#secretKey, {
      algorithms: ["RS256"],
      ...options,
    });
    return decoded;
  }
}
