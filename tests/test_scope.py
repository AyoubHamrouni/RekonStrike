"""Scope validation tests."""
from rekonstrike.scope import Scope


class TestScopeWildcard:
    def test_parse_wildcard(self, scope_wildcard):
        assert scope_wildcard.root_domain == "example.com"
        assert scope_wildcard.target_type == "wildcard"

    def test_in_scope(self, scope_wildcard):
        assert scope_wildcard.is_in_scope("sub.example.com")
        assert scope_wildcard.is_in_scope("deep.sub.example.com")
        assert scope_wildcard.is_in_scope("example.com")

    def test_out_of_scope(self, scope_wildcard):
        assert not scope_wildcard.is_in_scope("other.com")
        assert not scope_wildcard.is_in_scope("example.net")
        assert not scope_wildcard.is_in_scope("")


class TestScopeDomain:
    def test_parse_domain(self, scope_domain):
        assert scope_domain.root_domain == "example.com"
        assert scope_domain.target_type == "domain"

    def test_in_scope(self, scope_domain):
        assert scope_domain.is_in_scope("example.com")
        assert scope_domain.is_in_scope("sub.example.com")
        assert scope_domain.is_in_scope("deep.nested.example.com")

    def test_out_of_scope(self, scope_domain):
        assert not scope_domain.is_in_scope("other.com")
        assert not scope_domain.is_in_scope("example.org")

    def test_subdomain_of_subdomain(self, scope_domain):
        assert scope_domain.is_in_scope("a.b.example.com")


class TestScopeCIDR:
    def test_cidr_in_scope(self):
        scope = Scope.from_target("10.0.0.0/24", "cidr")
        assert scope.is_in_scope("10.0.0.1")
        assert scope.is_in_scope("10.0.0.255")

    def test_cidr_out_of_scope(self):
        scope = Scope.from_target("10.0.0.0/24", "cidr")
        assert not scope.is_in_scope("10.0.1.1")
        assert not scope.is_in_scope("11.0.0.1")

    def test_cidr_invalid(self):
        scope = Scope.from_target("not-a-cidr", "cidr")
        result = scope.is_in_scope("10.0.0.1")
        assert result is False


class TestScopeURL:
    def test_url_target(self):
        scope = Scope.from_target("https://example.com/path", "url")
        assert scope.root_domain == "example.com"
        assert scope.is_in_scope("example.com")

    def test_url_out_of_scope(self):
        scope = Scope.from_target("https://example.com", "url")
        assert not scope.is_in_scope("other.com")


class TestScopeFilter:
    def test_filter_list(self, scope_wildcard):
        subs = ["good.example.com", "bad.other.com", "also.example.com", ""]
        filtered = scope_wildcard.filter(subs)
        assert filtered == {"good.example.com", "also.example.com"}

    def test_empty_filter(self, scope_wildcard):
        assert scope_wildcard.filter(set()) == set()
