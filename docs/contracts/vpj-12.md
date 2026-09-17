# VPJ-12 native screenshot review, local slice

The Trip screen opens a single screenshot picker. PhotosUI returns only the
selected item; the app does not request full-library access. Vision recognizes
Chinese and English text on the device. Image bytes are limited to 12 MB and
the decoded image to 8,192 pixels per side / 16 million pixels total. Results
remain in the sheet's memory and are cleared on close or account change.

The screen shows each recognized line with its line number. The user chooses a
line, assigns date, amount, address or status, and corrects its value. A date
must be a real `yyyy-MM-dd` calendar day before it can be retained. For a
selected Trip, exact date matches are marked as already present; unmatched
dates are marked absent. Amount, address and status require manual comparison
because the current Trip representation has no matching fields. The view labels
its local review result and does not submit a Trip proposal or modify saved
content.

The C0 synthetic field contract in `user-artifact-c0.md` remains separate from
the native picker. This slice does not add a private inbox, remote OCR,
persistence, deletion receipt, replay across launches or real Trip Patch. The
screen's OCR result is not evidence of an external booking or service status.
