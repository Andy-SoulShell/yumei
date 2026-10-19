import type { CookieOptions, Request } from "express";

export function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  return {
    httpOnly: true,
    path: "/",
    // SameSite=Lax blocks the cookie from being sent on cross-site POST/etc.,
    // which is the foundation of CSRF protection (issue #8). The previous
    // `none` value required `secure: true` to be accepted by modern browsers
    // and meanwhile permitted arbitrary cross-site embedding.
    //
    // yumei is a same-origin app — frontend and tRPC backend are served by
    // the same Express process — so Lax is the right default. If we ever
    // ship a separately-hosted client, we'll reconsider via a feature flag.
    sameSite: "lax",
    secure: isSecureRequest(req),
  };
}
