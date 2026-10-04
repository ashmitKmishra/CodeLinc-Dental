"""Offline tests for the facts and guardrail logic (no AWS): python3 -m unittest backend/rag/test_advisor.py"""
import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(__file__))
import advisor as A

ROWS = [
    {"disease": "impacted wisdom teeth", "in_cost": 208.0, "in_hospital": "ECU Health Medical Center", "out_cost": 312.0,
     "out_hospital": "ECU Health Beaufort Hospital", "cash_value": 520.0},
    {"disease": "braces/orthodontics", "in_cost": 2686.4, "in_hospital": "FirstHealth Moore Regional Hospital", "out_cost": 4029.6,
     "out_hospital": "UNC Health Johnston", "cash_value": 6716.0},
    {"disease": "cavity/dental filling", "in_cost": 33.6, "in_hospital": "Atrium Health Carolinas Medical Center", "out_cost": 75.6,
     "out_hospital": "Moses H. Cone Memorial Hospital", "cash_value": None},
]
USER = {"first": "Ibrahim", "insurance": "Lincoln Financial", "member": "LF-75429183-00", "birth": "1992-07-08", "family": [
    {"firstName": "Fatima", "relationship": "spouse", "birthDate": "1994-10-26", "memberNumber": "LF-75429183-01"},
    {"firstName": "Maryam", "relationship": "child", "role": "daughter", "birthDate": "2020-01-28", "memberNumber": "LF-75429183-03"}]}
LOOKUP = lambda names: [{"name": n, "email": "AHPA@AtriumHealth.org" if "Atrium" in n else None, "phone": "704-355-0900", "url": "https://atriumhealth.org/x"} for n in names]
TODAY = date(2026, 10, 4)


def facts(treatments, who="self", wants=("compare",), uncovered=False, discussed=""):
    sel = {"for_person": who, "treatments": treatments, "wants": list(wants), "uncovered": uncovered}
    return A.build_facts(sel, ROWS, USER, LOOKUP, discussed, TODAY)


class Facts(unittest.TestCase):
    def test_saving_is_precomputed_and_allowed(self):
        f = facts(["impacted wisdom teeth"])
        self.assertIn(104.0, f["allowed"])
        self.assertEqual(A.violations("You save **$104.00**: **$208.00** vs **$312.00**.", f), [])

    def test_cash_only_when_asked(self):
        self.assertNotIn(520.0, facts(["impacted wisdom teeth"])["allowed"])
        self.assertIn(520.0, facts(["impacted wisdom teeth"], wants=("self_pay",))["allowed"])

    def test_child_braces_get_corrected_totals(self):
        f = facts(["braces/orthodontics"], who="Maryam")
        self.assertTrue({3872.8, 5216.0, 1343.2} <= f["allowed"])
        self.assertIn("your daughter Maryam", "\n".join(f["lines"]))

    def test_adult_braces_have_no_benefit_and_no_hospital_contact(self):
        f = facts(["braces/orthodontics"], who="Fatima")
        self.assertIn("your spouse Fatima", "\n".join(f["lines"]))
        self.assertFalse(f["confirm"])
        self.assertNotIn(3872.8, f["allowed"])

    def test_missing_self_pay_price_needs_confirming_only_when_asked(self):
        self.assertFalse(facts(["cavity/dental filling"])["confirm"])
        self.assertTrue(facts(["cavity/dental filling"], wants=("self_pay",))["confirm"])

    def test_uncovered_treatment_picks_a_stable_hospital_with_email(self):
        f = facts([], uncovered=True, wants=("other",))
        self.assertTrue(f["confirm"])
        self.assertEqual(f["contacts"][0]["email"], "AHPA@AtriumHealth.org")

    def test_greeting_does_not_send_them_to_a_hospital(self):
        self.assertFalse(facts([], wants=("other",))["confirm"])

    def test_deadline_is_mentioned_once_per_chat(self):
        self.assertIn("Deadline", "\n".join(facts(["impacted wisdom teeth"])["lines"]))
        self.assertNotIn("Deadline", "\n".join(facts(["impacted wisdom teeth"], discussed="your annual maximum of $1500")["lines"]))


class Guardrail(unittest.TestCase):
    def test_rejects_invented_values(self):
        f = facts(["impacted wisdom teeth"])
        bad = A.violations("That is $999.99. Plan holder Ibrahim (phone +15714736207). Email x@y.com or see https://evil.example", f)
        self.assertTrue({"$999.99", "x@y.com", "https://evil.example"} <= set(bad))
        self.assertTrue(any("plan holder" in b for b in bad))

    def test_accepts_stored_contacts(self):
        f = facts(["cavity/dental filling"], wants=("self_pay",))
        self.assertEqual(A.violations("Email **AHPA@AtriumHealth.org** or call 704-355-0900 or (704) 355-0900.", f), [])

    def test_yes_after_a_draft_offer_means_draft(self):
        h = [("user", "q"), ("assistant", "I can draft that email for you if you'd like.")]
        self.assertTrue(A.wants_draft(h, "yes please"))
        self.assertFalse(A.wants_draft(h, "what about braces?"))
        self.assertFalse(A.wants_draft([("assistant", "here you go")], "yes"))

    def test_fallback_speaks_to_the_employee_without_raw_rows(self):
        text = A.fallback(facts(["impacted wisdom teeth"]))
        self.assertTrue(text.startswith("Here is what I have on file for you."))
        self.assertNotIn("phone", text.lower())

    def test_confirm_line_and_draft_offer_are_guaranteed(self):
        f = facts(["cavity/dental filling"], wants=("self_pay",))
        out = A.ensure_confirm("Good news.\n\n" + f["closing"], f)
        self.assertIn("AHPA@AtriumHealth.org", out)
        self.assertIn("draft", out)
        self.assertTrue(out.endswith(f["closing"]))


if __name__ == "__main__":
    unittest.main()
