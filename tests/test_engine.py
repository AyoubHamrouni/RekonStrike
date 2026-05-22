"""Pipeline engine and phase registry tests."""

from rekonstrike.engine import phase, get_registered_phases, _phase_registry


def test_phase_registry_clear():
    _phase_registry.clear()


def test_register_phase():
    _phase_registry.clear()
    
    @phase(1, "Test Phase", "A test phase")
    class TestPhase:
        def __init__(self, ctx):
            self.ctx = ctx
        
        async def run(self):
            return "done"
    
    phases = get_registered_phases()
    assert len(phases) == 1
    assert phases[0]["number"] == 1
    assert phases[0]["name"] == "Test Phase"


def test_phase_ordering():
    _phase_registry.clear()
    
    @phase(3, "Third")
    class Third:
        async def run(self): pass
    
    @phase(1, "First")
    class First:
        async def run(self): pass
    
    @phase(2, "Second")
    class Second:
        async def run(self): pass
    
    phases = get_registered_phases()
    assert [p["number"] for p in phases] == [1, 2, 3]
    assert [p["name"] for p in phases] == ["First", "Second", "Third"]
