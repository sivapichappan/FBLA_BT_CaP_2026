"""Rotating QR / counter-code tokens — pure, no DB. Time is injected so the
rotation and skew window are deterministic."""

from app.services import qr

P = 30  # period seconds


def test_token_rotates_each_period():
    s = qr.generate_secret()
    t0 = qr.current_token(s, now=1000.0, period=P)
    t1 = qr.current_token(s, now=1000.0 + P, period=P)
    assert t0 != t1


def test_token_is_a_short_typable_code():
    s = qr.generate_secret()
    t = qr.current_token(s, now=1000.0, period=P)
    assert len(t) == 8 and t.isalnum() and t.upper() == t


def test_verify_accepts_the_current_token():
    s = qr.generate_secret()
    t = qr.current_token(s, now=1000.0, period=P)
    assert qr.verify_token(s, t, now=1000.0, period=P) is not None


def test_verify_accepts_within_one_period_of_skew():
    s = qr.generate_secret()
    t = qr.current_token(s, now=1000.0, period=P)
    # presented a period later — still inside the ±1 skew window
    assert qr.verify_token(s, t, now=1000.0 + P, period=P, skew=1) is not None


def test_verify_rejects_a_token_well_past_its_window():
    s = qr.generate_secret()
    t = qr.current_token(s, now=1000.0, period=P)
    assert qr.verify_token(s, t, now=1000.0 + 4 * P, period=P, skew=1) is None


def test_verify_rejects_a_bogus_token():
    s = qr.generate_secret()
    assert qr.verify_token(s, "BOGUS123", now=1000.0, period=P) is None


def test_verify_rejects_another_business_secret():
    a, b = qr.generate_secret(), qr.generate_secret()
    t = qr.current_token(a, now=1000.0, period=P)
    assert qr.verify_token(b, t, now=1000.0, period=P) is None


def test_verify_returns_the_period_counter_for_single_use():
    s = qr.generate_secret()
    t = qr.current_token(s, now=1000.0, period=P)
    assert qr.verify_token(s, t, now=1000.0, period=P) == int(1000.0 // P)
