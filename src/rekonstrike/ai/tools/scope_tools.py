import logging
from typing import List, Dict, Any

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser

from ..factory import get_llm

logger = logging.getLogger(__name__)

class ScopeAdvisor:
    """Tool for analyzing discovered assets against program scope definitions."""

    def __init__(self, settings: Any):
        self.settings = settings
        self.llm = get_llm(settings, temperature=0.0)
        
        self.scope_prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a scope analyst for a bug bounty program.
Your task is to compare discovered assets against the program's official in-scope and out-of-scope definitions.

Program Scope:
In-Scope: {in_scope}
Out-of-Scope: {out_of_scope}

Discovered Assets:
{discovered}

Analyze each discovered asset and determine if it is:
1. "in_scope_confirmed": Explicitly matches in-scope rules.
2. "out_of_scope_flagged": Explicitly matches out-of-scope rules or wildcards.
3. "unclear": Ambiguous or requires manual review.
4. "high_value": In-scope assets that look particularly interesting (e.g., UAT, Staging, Admin).

Return a JSON object with these keys."""),
            ("user", "Analyze the discovered assets now.")
        ])
        
        self.parser = JsonOutputParser()
        self.chain = self.scope_prompt | self.llm | self.parser

    async def analyze_scope(self, in_scope: List[str], out_of_scope: List[str], discovered: List[str]) -> Dict[str, Any]:
        """Analyzes assets against scope rules."""
        try:
            result = await self.chain.ainvoke({
                "in_scope": ", ".join(in_scope),
                "out_of_scope": ", ".join(out_of_scope),
                "discovered": "\n".join(discovered)
            })
            return result
        except Exception as e:
            logger.error(f"Failed to analyze scope: {e}")
            return {"error": str(e)}

async def run_scope_advisor(settings: Any, in_scope: List[str], out_of_scope: List[str], discovered: List[str]) -> Dict[str, Any]:
    advisor = ScopeAdvisor(settings)
    return await advisor.analyze_scope(in_scope, out_of_scope, discovered)
