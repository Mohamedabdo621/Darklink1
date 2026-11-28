#!/usr/bin/env python3
"""Deploy a Supabase Edge Function preserving verify_jwt=False.

The stock helper supabase_api.py deploy-fn hardcodes verify_jwt=True, which
would break push-send: it is invoked by pg_net from the DB trigger with NO
Authorization header, so JWT verification must stay OFF (verified live:
push-send verify_jwt=False, version 14). It also uses the outdated endpoint
path /functions/{slug}/deploy, which 404s; the current Management API
endpoint is POST /v1/projects/{ref}/functions/deploy?slug=<slug>.
This script mirrors the helper's deploy_function except for those two fixes.
Usage: deploy_fn_nojwt.py <project_ref> <slug> <path/to/index.ts>
"""
import json
import mimetypes
import sys
import urllib.request
import uuid as uuidlib

sys.path.insert(0, "/home/hatch/workspace/custom-connectors/custom.supabase/bin")
sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response
from supabase_api import BASE, NoRedirect


def main():
    ref, slug, filepath = sys.argv[1], sys.argv[2], sys.argv[3]
    boundary = "----pipboundary" + uuidlib.uuid4().hex
    with open(filepath, "rb") as f:
        content = f.read()
    metadata = json.dumps(
        {"entrypoint_path": "index.ts", "name": slug, "verify_jwt": False}
    )
    parts = []
    parts.append(f"--{boundary}".encode())
    parts.append(b'Content-Disposition: form-data; name="metadata"')
    parts.append(b"Content-Type: application/json")
    parts.append(b"")
    parts.append(metadata.encode())
    parts.append(f"--{boundary}".encode())
    parts.append(
        b'Content-Disposition: form-data; name="file"; filename="index.ts"'
    )
    ctype = mimetypes.guess_type(filepath)[0] or "application/typescript"
    parts.append(f"Content-Type: {ctype}".encode())
    parts.append(b"")
    parts.append(content)
    parts.append(f"--{boundary}--".encode())
    body = b"\r\n".join(parts)

    url = f"{BASE}/v1/projects/{ref}/functions/deploy?slug={slug}"
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    add_surrogate_to_request(req, "custom.supabase", allowed_hosts=["api.supabase.com"])
    try:
        with urllib.request.build_opener(NoRedirect()).open(req, timeout=120) as resp:
            print(resp.status)
            print(read_json_response(resp))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        print("HTTP", e.code)
        print(raw[:800])
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
