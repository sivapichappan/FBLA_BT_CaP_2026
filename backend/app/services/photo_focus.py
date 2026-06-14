"""Smart photo cropping: find where the SUBJECT of a photo is.

Business photos arrive in every aspect ratio, but cards crop them to fixed
frames (16:9 headers, square thumbnails). A naive center crop routinely chops
off the storefront sign or the food — the one thing the photo is "about".

The fix is one explainable computation, done ONCE at enrich time:

1. grayscale + downscale (detail beyond ~160 px adds nothing here),
2. edge detection (a 3×3 FIND_EDGES convolution) — busy, high-contrast areas
   (signs, products, faces) light up; flat sky/walls go dark,
3. split the edge map into a grid and sum each cell's energy, SQUARING pixel
   values so strong edges dominate scattered noise,
4. the focal point is the energy-weighted centroid of the cell centers —
   "the average location of the visual interest".

The result is stored as percentages (0–100) and applied in the UI as CSS
``object-position: x% y%``, which keeps the focal point in frame at ANY crop.
Coordinates are clamped to 20–80 because object-position at the extremes
pins the image edge to the frame edge — a subtle shift reframes better than
a hard pin ever does.
"""

from __future__ import annotations

from io import BytesIO
from typing import Optional

from PIL import Image, ImageFilter

# Analysis resolution and grid. 160 px / 10×10 cells is plenty: we want the
# REGION of interest, not pixel precision — and it keeps enrich fast.
_ANALYSIS_WIDTH = 160
_GRID = 10

# Clamp range for the stored percentages (see module docstring).
_CLAMP_LO, _CLAMP_HI = 20, 80


def focal_point(image_bytes: bytes) -> Optional[tuple[int, int]]:
    """Compute the (x%, y%) focal point of an image, or None if unreadable."""
    try:
        img = Image.open(BytesIO(image_bytes)).convert("L")
    except Exception:
        return None  # corrupt / unsupported bytes — caller keeps the 50/50 default

    # Downscale keeping aspect ratio; never upscale tiny images.
    if img.width > _ANALYSIS_WIDTH:
        img = img.resize(
            (_ANALYSIS_WIDTH, max(1, round(img.height * _ANALYSIS_WIDTH / img.width)))
        )

    edges = img.filter(ImageFilter.FIND_EDGES)
    pixels = list(edges.getdata())
    w, h = edges.size
    if w < _GRID or h < _GRID:
        return None  # too small to say anything meaningful

    # Sum squared edge energy per grid cell. Squaring rewards genuinely strong
    # edges (lettering, product contours) over broad low-level texture.
    cell_w, cell_h = w / _GRID, h / _GRID
    energy = [[0.0] * _GRID for _ in range(_GRID)]
    for y in range(h):
        row_base = y * w
        gy = min(int(y / cell_h), _GRID - 1)
        for x in range(w):
            v = pixels[row_base + x]
            energy[gy][min(int(x / cell_w), _GRID - 1)] += v * v

    total = sum(sum(row) for row in energy)
    if total <= 0:
        return None  # a perfectly flat image — center is as good as anything

    # Energy-weighted centroid of the cell centers, in percent of the frame.
    cx = sum(
        energy[gy][gx] * ((gx + 0.5) / _GRID)
        for gy in range(_GRID)
        for gx in range(_GRID)
    ) / total
    cy = sum(
        energy[gy][gx] * ((gy + 0.5) / _GRID)
        for gy in range(_GRID)
        for gx in range(_GRID)
    ) / total

    x_pct = min(max(round(cx * 100), _CLAMP_LO), _CLAMP_HI)
    y_pct = min(max(round(cy * 100), _CLAMP_LO), _CLAMP_HI)
    return x_pct, y_pct
