"""Intelligent ROI scoring — prioritizes assets most likely to contain bugs"""


class Scorer:
    """Returns (score: int, signals: list[str]) for a host dict and optional program dict."""

    TITLE_SIGNALS = {
        "admin": 35, "login": 30, "dashboard": 30, "api": 20, "portal": 25,
        "jenkins": 80, "grafana": 75, "kibana": 70, "phpmyadmin": 85,
        "swagger": 60, "graphql": 65, "console": 50, "debug": 70,
        "health": 15, "status": 15, "metrics": 40, "prometheus": 55,
        "s3": 40, "bucket": 35, "aws": 30, "cloud": 20,
        "backup": 45, "config": 40, "env": 60, "test": 25, "stage": 20,
    }

    TECH_WEIGHTS = {
        "wordpress": 8, "joomla": 10, "drupal": 10, "laravel": 15,
        "symfony": 12, "rails": 10, "django": 10, "flask": 10, "fastapi": 15,
        "express": 10, "next.js": 8, "nuxt.js": 8,
        "spring": 12, "tomcat": 15, "jboss": 20, "weblogic": 25,
        "iis": 5, "nginx": 2, "apache": 3, "cloudflare": -2,
        "php": 5, "asp.net": 8, "coldfusion": 20,
        "swagger": 25, "graphql": 30, "grpc": 20,
        "elasticsearch": 40, "kibana": 35, "redis": 20,
        "jenkins": 50, "gitlab": 35, "jira": 25, "confluence": 20,
    }

    STATUS_WEIGHTS = {200: 10, 301: 5, 302: 5, 401: 20, 403: 25, 404: 5, 500: 30, 502: 20, 503: 15}

    @classmethod
    def score(cls, host: dict, program: dict | None = None) -> tuple[int, list[str]]:
        score = 50  # baseline
        signals: list[str] = []

        # ── Title signals ─────────────────────────────────────────────────
        title = (host.get("title") or "").lower()
        for kw, pts in cls.TITLE_SIGNALS.items():
            if kw in title:
                score += pts
                signals.append(f"title:{kw}(+{pts})")
                break

        # ── Technology signals ────────────────────────────────────────────
        techs_raw = host.get("technologies")
        if isinstance(techs_raw, str):
            import json
            try:
                techs_raw = json.loads(techs_raw)
            except json.JSONDecodeError:
                techs_raw = [techs_raw]
        tech_str = " ".join(t.lower() for t in (techs_raw or []))
        for tech, pts in cls.TECH_WEIGHTS.items():
            if tech in tech_str:
                score += pts
                signals.append(f"tech:{tech}({pts:+d})")

        # ── Status code signals ───────────────────────────────────────────
        status = host.get("status_code") or 0
        if pts := cls.STATUS_WEIGHTS.get(status):
            score += pts
            signals.append(f"status:{status}(+{pts})")

        # ── Response header signals ───────────────────────────────────────
        headers = host.get("response_headers") or {}
        if "Content-Security-Policy" not in headers:
            score += 10
            signals.append("missing_csp(+10)")
        if "Strict-Transport-Security" not in headers:
            score += 5
            signals.append("missing_hsts(+5)")

        # ── SSL signals ──────────────────────────────────────────────────
        ssl = host.get("ssl_info") or {}
        if ssl.get("expired") or (ssl.get("valid") is False):
            score += 30
            signals.append("expired_ssl(+30)")
        if ssl.get("self_signed"):
            score += 20
            signals.append("self_signed_ssl(+20)")
        if ssl.get("deprecated_tls"):
            score += 25
            signals.append("deprecated_tls(+25)")
        if ssl.get("error"):
            score += 10
            signals.append("ssl_error(+10)")

        # ── Endpoint count signals ────────────────────────────────────────
        ep_count = host.get("endpoint_count") or 0
        ep_pts = min(ep_count * 2, 30)
        if ep_pts > 0:
            score += ep_pts
            signals.append(f"endpoints({ep_count})(+{ep_pts})")

        # ── WAF penalty ──────────────────────────────────────────────────
        wafs = host.get("waf_detected") or []
        if wafs:
            penalty = min(len(wafs) * 20, 40)
            score -= penalty
            signals.append(f"waf_detected({','.join(wafs)})(-{penalty})")

        # ── Program bounty boost ─────────────────────────────────────────
        if program:
            bounty_max = program.get("bounty_max")
            if bounty_max is not None:
                if bounty_max >= 10000:
                    score += 40
                    signals.append(f"program_bounty({bounty_max})(+40)")
                elif bounty_max >= 5000:
                    score += 25
                    signals.append(f"program_bounty({bounty_max})(+25)")
                elif bounty_max >= 1000:
                    score += 10
                    signals.append(f"program_bounty({bounty_max})(+10)")

        # ── Takeover boost ───────────────────────────────────────────────
        takeovers = host.get("takeover_findings") or []
        if takeovers:
            score += 100
            signals.append("takeover_detected(+100)")

        # ── Secret boost ─────────────────────────────────────────────────
        secrets = host.get("secret_findings") or []
        if secrets:
            secret_pts = min(len(secrets) * 60, 120)
            score += secret_pts
            signals.append(f"secrets_found({len(secrets)})(+{secret_pts})")

        return min(score, 999), signals
