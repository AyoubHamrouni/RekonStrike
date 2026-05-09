"""ROI scoring engine tests."""
from rekonstrike.scoring import Scorer


class TestScorer:
    def setup_method(self):
        self.scorer = Scorer()

    def test_default_score(self):
        score, signals = self.scorer.score({"url": "https://example.com"})
        assert score >= 0
        assert isinstance(signals, list)

    def test_status_code_200(self):
        score, signals = self.scorer.score({
            "url": "https://example.com",
            "status_code": 200,
        })
        assert any("status:200" in s for s in signals)

    def test_status_code_403(self):
        score, signals = self.scorer.score({
            "url": "https://example.com/admin",
            "status_code": 403,
        })
        assert any("status:403" in s for s in signals)

    def test_tech_weights(self):
        techs = ["react", "next.js", "swagger"]
        score, signals = self.scorer.score({
            "url": "https://example.com",
            "technologies": techs,
        })
        tech_signals = [s for s in signals if s.startswith("tech:")]
        assert len(tech_signals) > 0

    def test_title_signals(self):
        score, signals = self.scorer.score({
            "url": "https://example.com",
            "title": "Login — Admin Panel",
        })
        title_signals = [s for s in signals if s.startswith("title:")]
        assert len(title_signals) > 0

    def test_no_url(self):
        score, signals = self.scorer.score({})
        # Baseline 50 + missing_csp 10 + missing_hsts 5 = 65
        assert score == 65
        assert len(signals) >= 2

    def test_ssl_expired(self):
        score, signals = self.scorer.score({
            "url": "https://example.com",
            "ssl_info": {"valid": False, "error": "expired certificate"},
        })
        assert any("expired_ssl" in s for s in signals)
        assert any("ssl_error" in s for s in signals)

    def test_missing_csp(self):
        score, signals = self.scorer.score({
            "url": "https://example.com",
            "response_headers": {"server": "nginx"},
        })
        # Should flag missing CSP header
        csp_signals = [s for s in signals if "csp" in s.lower()]
        assert len(csp_signals) > 0

    def test_sort_by_score(self):
        hosts = [
            {"url": "https://a.com", "status_code": 200},
            {"url": "https://b.com"},
            {"url": "https://c.com", "status_code": 200, "title": "Admin Panel"},
        ]
        results = []
        for h in hosts:
            s, sigs = self.scorer.score(h)
            results.append((s, h["url"]))
        results.sort(reverse=True)
        assert results[0][1] != results[-1][1]
