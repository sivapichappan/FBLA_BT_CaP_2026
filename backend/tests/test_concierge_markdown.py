"""The concierge flattens any stray Markdown from the LLM to plain text — the
chat bubble must never show raw '**' or bullet asterisks."""

from app.services import concierge


def test_strip_removes_bold_and_normalizes_bullets():
    text = "Picks:\n* **La Panadería** is great\n- **Revolución** too"
    out = concierge._strip_markdown(text)
    assert "*" not in out                      # no asterisks survive
    assert "La Panadería" in out and "Revolución" in out
    assert "• La Panadería is great" in out    # bullets become a clean •
    assert "• Revolución too" in out


def test_strip_handles_underscore_bold():
    assert concierge._strip_markdown("try __Buvette__ today") == "try Buvette today"


def test_strip_leaves_plain_text_untouched():
    assert concierge._strip_markdown("just a plain sentence") == "just a plain sentence"
