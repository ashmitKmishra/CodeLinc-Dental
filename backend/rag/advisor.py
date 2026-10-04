"""Two-step answer pipeline for the chat.

1. select(): a small model call that only PICKS - which person, which treatments, what they want - through a strict tool schema.
2. build_facts(): code looks up every number, hospital and contact and does ALL the arithmetic (savings, plan limits, corrected totals).
3. write(): a second call writes the reply in the voice of the family's advocate, from those facts only.
4. violations(): any dollar figure, email, phone number or link in the reply that is not in the facts is rejected. The writer gets one
   retry that names the offending values; after that a code template (fallback) answers in the same voice. The model never invents facts.

The Lincoln Financial terms below come from the plan summary (packages/contracts/src/plans.ts); the stored estimates were built by
scripts/build_patient_treatment_vectors.py. All four people are on this plan.
"""
import json
import re
from datetime import date

ANNUAL_MAX = 1500.00            # per person per plan year; preventive, basic and major work; restarts every January 1
ORTHO_MAX = 1500.00             # orthodontics: separate, per child under 19, LIFETIME, so it never restarts
ORTHO_AGE_LIMIT = 19
ORTHO_LIMIT_RESETS_YEARLY = False   # set True only if the real policy's orthodontic limit restarts each plan year
ALLOWED_PCT = 0.8               # allowed amount = 80% of the cash price
PREDETERMINATION_OVER = 300
DEDUCTIBLE_PERSON, DEDUCTIBLE_FAMILY = 25, 75

# disease key -> (coverage class, share the plan pays of the allowed amount, short name used in sentences)
TREATMENTS = {
    "braces/orthodontics": ("ortho", 0.5, "braces"),
    "teeth cleaning": ("preventive", 1.0, "teeth cleaning"),
    "cavity/dental filling": ("basic", 0.8, "cavity filling"),
    "gum sensitivity": ("basic", 0.8, "gum treatment"),
    "impacted wisdom teeth": ("major", 0.5, "wisdom teeth removal"),
}
WANTS = ["in_network", "out_of_network", "self_pay", "compare", "hospital", "draft_email", "plan_question", "other"]

MONEY_RE = re.compile(r"\$\s?(\d[\d,]*(?:\.\d+)?)")
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
US_PHONE_RE = re.compile(r"(?<!\d)(?:\+?1[-. ]?)?\(?(\d{3})\)?[-. ]?(\d{3})[-. ]?(\d{4})(?!\d)")
URL_RE = re.compile(r"https?://[^\s*)>\]]+")
EMOJI_RE = re.compile("[\U0001F000-\U0001FAFF☀-➿⬀-⯿⌀-⏿️‍]")

SELECT_TOOL = {"toolSpec": {
    "name": "select",
    "description": "Record which person and which treatments the patient's latest message is about, and what they want to know.",
    "inputSchema": {"json": {"type": "object", "required": ["for_person", "treatments", "wants", "uncovered"], "properties": {
        "for_person": {"type": "string", "description": "'self' for the employee, or the first name of a family member exactly as listed in FAMILY"},
        "treatments": {"type": "array", "maxItems": 2, "items": {"type": "string", "enum": list(TREATMENTS)}},
        "wants": {"type": "array", "items": {"type": "string", "enum": WANTS}},
        "uncovered": {"type": "boolean", "description": "true when the message is about a treatment that is not in the list"},
    }}},
}}

SELECT_SYSTEM = """You route messages in a dental-benefits chat. Always call the select tool exactly once.
- for_person: "self" (the employee, who is the one chatting) unless the latest message, or the topic being discussed, is about a family member,
  in which case use that person's first name exactly as listed in FAMILY.
- treatments: up to two of the listed treatments that the message, or the topic being discussed, is about. Short follow-ups ("what about out of
  network?", "and for my son?", "yes please") continue the topic of the earlier messages. Leave it empty only when none applies, for example a
  crown or an implant, and then set uncovered to true.
- wants: what they want to know. Use "hospital" ONLY when they ask which hospital to use, or how to contact one. Use "self_pay" ONLY when they explicitly say cash, self-pay, uninsured, or without insurance. An ordinary
  question such as "how much is a filling?" or "what does it cost?" is "compare" (the normal in-network versus out-of-network picture), never self_pay. A "yes" or
  "please do" or "write it" in answer to an offer to draft an email or message means draft_email."""

WRITER_SYSTEM = """You are Floss, the family's advocate for their dental benefits. Sound like a friendly family lawyer who is firmly on their side:
confident, kind, reassuring and uplifting, with a lawyer's care for detail. Make them feel looked after ("you're in good hands", "good news",
"here is what works in your favour"). Present facts as wins you are securing for them, and present limits or deadlines as things you will
help them handle, never as bad news. Always argue for the family's best interest: point out the best-value option, spot limits and
deadlines before they cost money, and say exactly what to ask for. Add one short encouraging sentence before the closing question (for
example that planning ahead is exactly the right move; vary the wording from message to message). Stay concise, about four to seven sentences, with no legal jargon or Latin, no
flowery speeches and no guarantees. You never overpromise, never invent plan rules, and never agree with something untrue just to please.
Never use emojis.

Do not repeat yourself within a chat: if an earlier message already used an opening line, an encouraging line, a tip or a deadline, use fresh
wording or just refer back to it briefly. If the message is only a greeting, thanks or a question about the chat itself, answer it naturally
and briefly.

Voice:
- You are talking to the employee, who is the plan holder. Say "you" and "your" for them. Never say "plan holder", never call them by their full
  name in the third person, and never mention their phone number.
- Refer to other people the way FACTS gives them, for example "your son Aarav", "your daughter Maryam", "your spouse Priyanka".
- Spouse and children are priced exactly the same as the employee.
- Do not mention cash, self-pay or "without insurance" prices unless THEY WANT includes self_pay.
- Write short natural paragraphs, not a data dump. Cover only what they asked about, plus the most useful advocate point from FACTS.

Facts:
- Use ONLY the FACTS block. Quote every dollar amount and hospital name exactly as written there, in markdown bold such as **$208.00** and
  **ECU Health Medical Center**. Use no other markdown. Never calculate, subtract, round or state a figure that is not written in FACTS.
- Where FACTS gives a saving, a limit, a corrected total or a deadline, say it plainly: that is your advocacy.
- Do not diagnose or give medical, legal or financial advice. Costs are estimates, not quotes. Anything about how care is done or billed is
  for the dentist: say "ask the dentist whether it is clinically sound", never push it.
- Only when FACTS has a CONFIRM WITH section: tell them to confirm the price with the first (in-network) hospital listed, giving its email in bold
  if one is listed (otherwise its phone and website, saying it publishes no email for price questions); mention the second hospital only if they
  asked about out-of-network. Copy contact details exactly; never invent or change them. You MUST then offer, in one short sentence: "I can draft
  that email for you if you'd like." (If no email is listed, offer a short message or a list of questions for the call.) Without a CONFIRM WITH
  section, do not send them to a hospital at all.
- When THEY WANT includes draft_email, write ONE message now, to the first hospital listed in CONFIRM WITH only. If it has an email: "To:" its
  email, "Subject:", then a short polite body. If it publishes no email: write the same text as a note for the hospital's website contact form
  or a short phone script, with no "To:" line and no invented address. The body naming the person it is for, the insurer (Lincoln Financial), the treatment, their Member ID
  exactly as given in FACTS, and what to confirm (the self-pay price if THEY WANT includes self_pay, otherwise the in-network price). Sign with the employee's first name. Use [square brackets] for anything else unknown, such as [date of birth]. Never include
  the employee's phone number or any dollar amount. Add one line saying to fill in the brackets before sending.
- End with the CLOSING QUESTION from FACTS, copied exactly, as the last line."""


def clean(text):
    text = EMOJI_RE.sub("", text)
    return re.sub(r"[ \t]+\n", "\n", re.sub(r"[ \t]{2,}", " ", text)).strip()


def money(x):
    return f"${x:.2f}"


def amounts(text):
    return {round(float(m.replace(",", "")), 2) for m in MONEY_RE.findall(text)}


def age(iso, today):
    y, m, d = int(iso[:4]), int(iso[5:7]), int(iso[8:10])
    return today.year - y - ((today.month, today.day) < (m, d))


def alternate(history):
    """History rows -> Converse messages: alternating roles, starting with the user."""
    messages = []
    for role, text in history:
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"][0]["text"] += "\n" + text
        elif messages or role == "user":
            messages.append({"role": role, "content": [{"text": text}]})
    return messages


def with_last_user(messages, text):
    """Replace (or add) the final user message, keeping roles alternating."""
    messages = [dict(m) for m in messages]
    if messages and messages[-1]["role"] == "user":
        messages.pop()
    messages.append({"role": "user", "content": [{"text": text}]})
    return messages


# ---------------------------------------------------------------- step 1: pick

YES_RE = re.compile(r"^\s*(yes|yeah|yep|yup|sure|ok|okay|please|do it|go ahead|write it|draft it|that would be great|sounds good)\b", re.I)


SELF_PAY_RE = re.compile(r"without insurance|no insurance|uninsured|self.?pay|\bcash\b|out of pocket", re.I)


def wants_draft(history, question):
    """A short 'yes' straight after Floss offered to draft an email or message."""
    last_assistant = next((t for r, t in reversed(history) if r == "assistant"), "")
    return bool(YES_RE.match(question)) and len(question) < 60 and "draft" in last_assistant.lower()


def select(bedrock, model, history, question, user, rows):
    """Which person, which treatments, what they want. Always returns a valid selection, falling back to the top-ranked row."""
    fallback_sel = {"for_person": "self", "treatments": [rows[0]["disease"]] if rows else [], "wants": ["compare"], "uncovered": False}
    family = ", ".join(f["firstName"] for f in user["family"]) or "none"
    prompt = f"FAMILY: {family}\nTREATMENTS: {', '.join(TREATMENTS)}\n\nLATEST MESSAGE: {question}"
    try:
        resp = bedrock.converse(
            modelId=model, system=[{"text": SELECT_SYSTEM}], messages=with_last_user(alternate(history), prompt),
            toolConfig={"tools": [SELECT_TOOL], "toolChoice": {"tool": {"name": "select"}}},
            inferenceConfig={"maxTokens": 300, "temperature": 0})
        raw = next(b["toolUse"]["input"] for b in resp["output"]["message"]["content"] if "toolUse" in b)
    except Exception as e:  # never let routing break the chat
        print("select failed, using top row", repr(e)[:200])
        return fallback_sel
    if wants_draft(history, question):
        raw["wants"] = list(raw.get("wants") or []) + ["draft_email"]
        earlier = [t for r, t in history if r == "user"][:-1]
        if earlier and SELF_PAY_RE.search(earlier[-1]):  # the email should ask what they were asking about
            raw["wants"].append("self_pay")
    names = {f["firstName"].lower(): f["firstName"] for f in user["family"]}
    who = names.get(str(raw.get("for_person", "")).strip().lower(), "self")
    treatments = [t for t in dict.fromkeys(raw.get("treatments") or []) if t in TREATMENTS][:2]
    wants = [w for w in (raw.get("wants") or []) if w in WANTS] or (["compare"] if treatments else ["other"])
    return {"for_person": who, "treatments": treatments, "wants": wants, "uncovered": bool(raw.get("uncovered")) and not treatments}


# ---------------------------------------------------------------- step 2: facts (all arithmetic lives here)

def contact_text(c):
    if c["email"]:
        return f"email {c['name']} at {c['email']}" + (f" or call {c['phone']}" if c["phone"] else "")
    return f"{c['name']} publishes no email for price questions: call {c['phone'] or 'its main number'} or see {c['url']}"


def build_facts(sel, rows, user, lookup_contacts, discussed, today):
    by = {r["disease"]: r for r in rows}
    f = {"allowed": set(), "contacts": [], "lines": [], "treatments": [], "confirm": False, "draft": "draft_email" in sel["wants"], "sel": sel}
    A = f["allowed"]

    def add(x):
        A.add(round(x, 2))
        return money(x)

    # who is this about
    if sel["for_person"] == "self":
        who = {"kind": "self", "first": user["first"], "age": age(user["birth"], today), "member": user["member"], "voice": "you"}
    else:
        m = next(x for x in user["family"] if x["firstName"] == sel["for_person"])
        role = m.get("role") or m["relationship"]
        who = {"kind": m["relationship"], "first": m["firstName"], "age": age(m["birthDate"], today), "member": m.get("memberNumber"),
               "voice": f"your {role} {m['firstName']}"}
    f["who"] = who
    L = f["lines"]
    L.append(f"EMPLOYEE (the person you are talking to): {user['first']}, plan holder, insurance {user['insurance']}, member number {user['member']}.")
    L.append(f"THIS IS ABOUT: {who['voice']} (age {who['age']}, member number {who['member']}).")
    L.append("THEY WANT: " + ", ".join(sel["wants"]) + ".")
    want_cash = "self_pay" in sel["wants"]
    days_left = (date(today.year, 12, 31) - today).days

    first_row = None
    for d in sel["treatments"]:
        r = by.get(d)
        if not r:
            continue
        first_row = first_row or r
        cls, cov, name = TREATMENTS[d]
        cash = r["cash_value"]
        L.append(f"\nTREATMENT: {name}")
        t = {"name": name, "in": r["in_cost"], "in_h": r["in_hospital"], "out": r["out_cost"], "out_h": r["out_hospital"], "cash": cash, "note": None}
        corrected = None
        if cls == "ortho" and cash is not None:
            allowed_amt = cash * ALLOWED_PCT
            share = allowed_amt * cov
            if who["kind"] != "child" or who["age"] >= ORTHO_AGE_LIMIT:
                L.append(f"- Lincoln's plan summary lists orthodontic (braces) benefits only for children under {ORTHO_AGE_LIMIT}; none are listed for adults, so for "
                         f"{who['voice']} the cost without a benefit is the full price of {add(cash)}. Tell them to confirm with Lincoln Financial before booking, "
                         f"using the member services number on the member ID card. Do not point them to a hospital for this.")
                t["adult_ortho"] = True
            else:
                L.append(f"- Lincoln pays {cov * 100:.0f}% of the allowed amount for braces, up to a {add(ORTHO_MAX)} orthodontic maximum for each child under "
                         f"{ORTHO_AGE_LIMIT}.")
                if not ORTHO_LIMIT_RESETS_YEARLY:
                    L.append(f"- That {money(ORTHO_MAX)} is a LIFETIME maximum for the child, separate from the {add(ANNUAL_MAX)} annual maximum, and it does not "
                             f"restart in January, so splitting braces across plan years would not unlock more benefit.")
                if share > ORTHO_MAX:
                    corrected = (allowed_amt - ORTHO_MAX, cash - ORTHO_MAX)
                    L.append(f"- Because the plan share would be {add(share)}, over the limit, the plan pays only {money(ORTHO_MAX)}. CORRECTED totals for the family: "
                             f"{add(corrected[0])} in-network at {r['in_hospital']}, or {add(corrected[1])} out-of-network at {r['out_hospital']}. "
                             f"Use these corrected totals instead of the uncorrected in-network and out-of-network prices.")
                    L.append(f"- Ways to ease the cost: ask the orthodontist for a predetermination of benefits (Lincoln recommends one when you expect to pay more "
                             f"than ${PREDETERMINATION_OVER}), ask for a monthly payment plan, check whether an FSA or HSA can cover the balance, and compare the "
                             f"in-network and out-of-network quotes.")
                    A.add(PREDETERMINATION_OVER)
                    if ORTHO_LIMIT_RESETS_YEARLY:
                        L.append(f"- Phasing: if the orthodontist agrees it is clinically sound, the upper arch could be done in December and the lower arch in "
                                 f"January after the limit restarts, so the plan could pay up to {money(ORTHO_MAX)} in each plan year.")
        elif cls != "ortho" and cash is not None:
            share = cash * ALLOWED_PCT * cov
            if share > ANNUAL_MAX:
                L.append(f"- The plan pays at most {add(ANNUAL_MAX)} per person each plan year (restarts January 1) but the plan share here would be {add(share)}. If the "
                         f"dentist agrees it can be done in phases, the first phase before December 31 and the rest after January 1 would let the plan pay "
                         f"{money(ANNUAL_MAX)} now and about {add(share - ANNUAL_MAX)} in the new plan year.")
        if cls in ("preventive", "basic", "major") and days_left <= 120 and "annual maximum" not in discussed:
            L.append(f"- Deadline: the {add(ANNUAL_MAX)} annual maximum restarts on January 1 ({days_left} days from now) and unused annual benefit is lost, so covered "
                     f"work is best scheduled before December 31.")
        if not t.get("adult_ortho"):
            ci, co = (corrected if corrected else (r["in_cost"], r["out_cost"]))
            t["shown_in"], t["shown_out"] = ci, co
            L.append(f"- In-network: {add(ci)} at {r['in_hospital']}" + (" (corrected for the plan limit)" if corrected else ""))
            L.append(f"- Out-of-network: {add(co)} at {r['out_hospital']}" + (" (corrected for the plan limit)" if corrected else ""))
            if co > ci:
                L.append(f"- Going in-network saves {add(co - ci)} compared with out-of-network.")
                t["saving"] = co - ci
        if want_cash:  # cash prices only come up when the person asks for them
            if cash is not None:
                L.append(f"- Cash without insurance: {add(cash)}")
            else:
                L.append("- Cash without insurance: NOT ON FILE. It needs manual verification, so do not state a cash price.")
                f["confirm"] = True
        f["treatments"].append(t)

    if sel["uncovered"]:
        f["confirm"] = True
        L.append("\nNOTE: the stored estimates do not cover what they asked about. Do not guess a price; tell them so and help them confirm with a hospital.")
    if sel["uncovered"] or not f["treatments"] or "plan_question" in sel["wants"]:
        A.update({ANNUAL_MAX, ORTHO_MAX, DEDUCTIBLE_PERSON, DEDUCTIBLE_FAMILY, PREDETERMINATION_OVER})
        L.append(f"\nPLAN BASICS (Lincoln Financial group dental, any dentist): preventive care such as cleanings is covered at 100%; basic work such as fillings at 80% "
                 f"and major work such as crowns and wisdom teeth at 50%, after a ${DEDUCTIBLE_PERSON} deductible per person (${DEDUCTIBLE_FAMILY} per family) for basic and major "
                 f"work. The annual maximum is {money(ANNUAL_MAX)} per person per calendar year, restarting January 1. Braces are covered for children under "
                 f"{ORTHO_AGE_LIMIT} up to a {money(ORTHO_MAX)} lifetime maximum. Lincoln recommends asking for a predetermination of benefits before work that will cost "
                 f"more than ${PREDETERMINATION_OVER}. Implants, veneers and cosmetic work are not covered.")

    if "hospital" in sel["wants"] or f["draft"]:
        f["confirm"] = True
    if f["confirm"]:
        if first_row:
            f["contacts"] = lookup_contacts([h for h in (first_row["in_hospital"], first_row["out_hospital"]) if h])
        elif rows:  # nothing specific to point at: a stable choice, preferring an in-network hospital that publishes an email
            order = [by[d]["in_hospital"] for d in TREATMENTS if d in by]
            options = lookup_contacts(order)
            options.sort(key=lambda c: (c["email"] is None, order.index(c["name"])))
            f["contacts"] = options[:1]
        L.append("\nCONFIRM WITH (use only these entries, each hospital's own details):")
        for i, c in enumerate(f["contacts"]):
            L.append(f"- {c['name']} ({'in-network' if i == 0 else 'out-of-network'} option): email {c['email'] or 'none published'}; phone {c['phone'] or 'none'}; "
                     f"website {c['url']}")
        if not f["contacts"]:
            L.append("- none on file")

    chosen = {t for t in sel["treatments"]}
    fresh = [d for d in TREATMENTS if d not in chosen and TREATMENTS[d][2] not in discussed] or [d for d in TREATMENTS if d not in chosen]
    f["closing"] = "Would you also be interested in something similar to be checked" + (f", such as {TREATMENTS[fresh[0]][2]}?" if fresh else "?")
    L.append(f"\nCLOSING QUESTION (copy exactly as the last line): {f['closing']}")
    return f


# ---------------------------------------------------------------- step 3: write

def write(bedrock, model, facts, history, question, feedback=None):
    text = "FACTS:\n" + "\n".join(facts["lines"]) + f"\n\nTheir latest message: {question}"
    if feedback:
        text += ("\n\nYour previous draft was rejected because it contained values that are not in FACTS: " + ", ".join(feedback) +
                 ". Rewrite it using only values written in FACTS.")
    resp = bedrock.converse(modelId=model, system=[{"text": WRITER_SYSTEM}], messages=with_last_user(alternate(history), text),
                            inferenceConfig={"maxTokens": 900, "temperature": 0.3})
    return clean(resp["output"]["message"]["content"][0]["text"])


def violations(answer, facts):
    """Values in the reply that are not in the facts: dollar figures, emails, phone numbers, links, and phrases that should not appear."""
    bad = {money(x) for x in amounts(answer) - facts["allowed"]}
    contacts = facts["contacts"]
    ok_emails = {c["email"].lower() for c in contacts if c["email"]}
    ok_phones = {re.sub(r"\D", "", c["phone"])[-10:] for c in contacts if c["phone"]}
    ok_urls = {c["url"].rstrip("/").lower() for c in contacts}
    bad |= {e for e in EMAIL_RE.findall(answer) if e.lower().rstrip(".") not in ok_emails}
    bad |= {"".join(m) for m in US_PHONE_RE.findall(answer) if "".join(m) not in ok_phones}
    bad |= {u for u in URL_RE.findall(answer) if u.rstrip("/.,;:").lower() not in ok_urls}
    if re.search(r"plan holder|\(phone", answer, re.I):
        bad.add("wording about the 'plan holder' or a phone number")
    return sorted(bad)


def fallback(facts):
    """Used only when the writer fails twice. Same voice, built from the facts by code."""
    who = facts["who"]["voice"]
    parts = [f"Here is what I have on file for {who}."]
    for t in facts["treatments"]:
        if t.get("adult_ortho"):
            parts.append(f"For {t['name']}, Lincoln's plan summary lists no benefit for adults, so the cost would be the full cash price of **{money(t['cash'])}**. "
                         f"It is worth confirming with Lincoln before booking.")
            continue
        s = f"For {t['name']}: in-network is **{money(t['shown_in'])}** at **{t['in_h']}** and out-of-network is **{money(t['shown_out'])}** at **{t['out_h']}**"
        if "self_pay" in facts["sel"]["wants"]:
            s += f", or **{money(t['cash'])}** paying cash." if t["cash"] is not None else ". The cash price is not on file and needs to be confirmed."
        else:
            s += "."
        if t.get("saving"):
            s += f" Going in-network saves **{money(t['saving'])}**."
        parts.append(s)
    if facts["confirm"] and facts["contacts"]:
        parts.append(f"To confirm the price, {contact_text(facts['contacts'][0])}. I can draft that message for you if you'd like.")
    return "\n\n".join(parts)


def ensure_confirm(answer, facts):
    """When the answer should send them to a hospital, guarantee the hospital's details and the offer to draft the email are there."""
    if not (facts["confirm"] and facts["contacts"]) or facts["draft"]:
        return answer
    c = facts["contacts"][0]
    shown = (c["email"] or c["phone"] or c["url"] or "").lower() in answer.lower() if c["email"] else \
        any(x and x.lower() in answer.lower() for x in (c["phone"], c["url"]))
    extra = []
    if not shown:
        extra.append(f"To confirm the price, {contact_text(c)}.")
    if "draft" not in answer.lower():
        extra.append("I can draft that email for you if you'd like." if c["email"] else "I can draft a short message or a list of questions for that call if you'd like.")
    if not extra:
        return answer
    body, sep, tail = answer.rpartition("\n\n")  # keep the closing question last
    return (body + "\n\n" if sep else "") + " ".join(extra) + "\n\n" + tail if sep else " ".join(extra) + "\n\n" + answer


def respond(bedrock, model, history, question, rows, user, lookup_contacts, today, time_left_ms):
    sel = select(bedrock, model, history, question, user, rows)
    print("selection", json.dumps(sel))
    discussed = " ".join(t for _, t in history).lower()
    facts = build_facts(sel, rows, user, lookup_contacts, discussed, today)
    answer = write(bedrock, model, facts, history, question)
    bad = violations(answer, facts)
    if bad and time_left_ms() > 12000:
        print("writer retry", bad)
        answer = write(bedrock, model, facts, history, question, feedback=bad)
        bad = violations(answer, facts)
    replaced = bool(bad)
    if replaced:
        print("guardrail replaced answer", bad)
        answer = fallback(facts)
    answer = ensure_confirm(answer, facts)
    if "similar to be checked" not in answer.lower():
        answer += "\n\n" + facts["closing"]
    return answer, sel, replaced
