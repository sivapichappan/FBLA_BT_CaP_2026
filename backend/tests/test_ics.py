"""Unit tests for the hand-rolled .ics export (idea 10c). Pure, no DB/network."""

from app.services.trip_export import to_ics

_TRIP = {
    "id": 7,
    "title": "Sat, downtown",
    "stops": [
        {"name": "Carmela Coffee", "address": "1 Bleecker St, NYC",
         "slot": "coffee", "arrive_min": 10 * 60 + 5, "dwell_min": 45},
        {"name": "Strand, Books & More", "address": "828 Broadway",
         "slot": "browse", "arrive": "11:00 AM", "dwell_min": 40},
    ],
}


def test_one_vevent_per_stop():
    ics = to_ics(_TRIP)
    assert ics.count("BEGIN:VEVENT") == 2
    assert ics.count("END:VEVENT") == 2
    assert ics.startswith("BEGIN:VCALENDAR") and ics.rstrip().endswith("END:VCALENDAR")


def test_crlf_line_endings():
    ics = to_ics(_TRIP)
    assert "\r\n" in ics
    # every physical line is terminated by CRLF (no lone LF)
    for line in ics.split("\r\n"):
        assert "\n" not in line


def test_escapes_commas_in_text():
    ics = to_ics(_TRIP)
    # the comma in "Strand, Books & More" must be escaped per RFC 5545
    assert "Strand\\, Books & More" in ics


def test_dtstart_uses_arrive_min_and_tz():
    ics = to_ics(_TRIP, date="2026-06-20")
    assert "DTSTART;TZID=America/New_York:20260620T100500" in ics  # 10:05 from arrive_min
    assert "DTEND;TZID=America/New_York:20260620T105000" in ics    # +45 min


def test_falls_back_to_arrive_label():
    ics = to_ics(_TRIP, date="2026-06-20")
    # second stop has no arrive_min, only "11:00 AM" → parsed
    assert "DTSTART;TZID=America/New_York:20260620T110000" in ics


def test_each_event_has_uid_and_dtstamp():
    ics = to_ics(_TRIP)
    assert ics.count("UID:trip-7-") == 2
    assert ics.count("DTSTAMP:") == 2
