"""Subdomain takeover signatures — CNAME + HTTP fingerprins for known vulnerable services."""

SIGNATURES: dict[str, dict] = {
    "github-pages": {
        "cname_patterns": ["github.io"],
        "fingerprint": "There isn't a GitHub Pages site here",
        "status_codes": [404],
        "confidence": "high",
    },
    "heroku": {
        "cname_patterns": ["herokudns.com", "herokuapp.com"],
        "fingerprint": "No such app",
        "status_codes": [404],
        "confidence": "high",
    },
    "shopify": {
        "cname_patterns": ["myshopify.com"],
        "fingerprint": "Sorry, this shop is currently unavailable",
        "status_codes": [404],
        "confidence": "high",
    },
    "fastly": {
        "cname_patterns": ["fastly.net"],
        "fingerprint": "Fastly error: unknown domain",
        "status_codes": [404],
        "confidence": "high",
    },
    "ghost": {
        "cname_patterns": ["ghost.io"],
        "fingerprint": "The thing you were looking for is no longer here",
        "status_codes": [404],
        "confidence": "medium",
    },
    "surge": {
        "cname_patterns": ["surge.sh"],
        "fingerprint": "project not found",
        "status_codes": [404],
        "confidence": "high",
    },
    "netlify": {
        "cname_patterns": ["netlify.app", "netlify.com"],
        "fingerprint": "Not found - Request ID",
        "status_codes": [404],
        "confidence": "high",
    },
    "aws-s3": {
        "cname_patterns": ["s3.amazonaws.com", "s3-website"],
        "fingerprint": "NoSuchBucket",
        "status_codes": [404, 403],
        "confidence": "high",
    },
    "azure": {
        "cname_patterns": ["azurewebsites.net", "cloudapp.net"],
        "fingerprint": "404 Web Site not found",
        "status_codes": [404],
        "confidence": "high",
    },
    "zendesk": {
        "cname_patterns": ["zendesk.com"],
        "fingerprint": "Help Center Closed",
        "status_codes": [404],
        "confidence": "medium",
    },
    "readme": {
        "cname_patterns": ["readme.io", "readmessl.com"],
        "fingerprint": "Project doesnt exist",
        "status_codes": [404],
        "confidence": "medium",
    },
    "wordpress": {
        "cname_patterns": ["wordpress.com"],
        "fingerprint": "Do you want to register",
        "status_codes": [404],
        "confidence": "medium",
    },
    "teamwork": {
        "cname_patterns": ["teamwork.com"],
        "fingerprint": "Oops - We didn't find your site",
        "status_codes": [404],
        "confidence": "medium",
    },
    "helpscout": {
        "cname_patterns": ["helpscoutdocs.com"],
        "fingerprint": "No settings were found",
        "status_codes": [404],
        "confidence": "medium",
    },
    "intercom": {
        "cname_patterns": ["custom.intercom.help"],
        "fingerprint": "This page is reserved",
        "status_codes": [404],
        "confidence": "medium",
    },
}
