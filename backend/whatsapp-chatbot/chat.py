"""Talk to the Bedrock model from the terminal, no Twilio needed.

    python chat.py              interactive chat (type RESET to clear, Ctrl+C to quit)
    python chat.py "question"   ask one question
    python chat.py --models     list your fine-tuned models and the ARN to put in BEDROCK_MODEL_ID
"""
import sys

import bedrock


def main():
    args = sys.argv[1:]
    if args == ["--models"]:
        bedrock.list_models()
        return

    print("Models, in order:", bedrock.model_ids() or "NONE CONFIGURED (check .env)")
    if args:
        reply, model = bedrock.ask([], " ".join(args))
        print(f"[{model}] {reply}")
        return

    history = []
    while True:
        try:
            text = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if text.upper() == "RESET":
            history = []
            continue
        if not text:
            continue
        reply, model = bedrock.ask(history, text)
        print(f"[{model}] {reply} ({len(reply)} chars)")
        if model:
            history += [
                {"role": "user", "content": [{"text": text}]},
                {"role": "assistant", "content": [{"text": reply}]},
            ]


if __name__ == "__main__":
    main()
