#!/usr/bin/env python3
"""Generate proper PWA icons from the green team logo.

Maskable icons need the logo within the safe zone (inner 80% circle),
with the background color filling the rest.
"""
from PIL import Image, ImageDraw
import os

LOGO_PATH = os.path.join(os.path.dirname(__file__), '..', 'client', 'public', 'images', 'logo-green.png')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'client', 'public')
BG_COLOR = (15, 23, 42)  # #0f172a - same as theme_color

def create_regular_icon(logo: Image.Image, size: int, output_path: str):
    """Create a regular (any purpose) icon - logo centered on dark background."""
    canvas = Image.new('RGBA', (size, size), (*BG_COLOR, 255))
    
    # Scale logo to fit with some padding (85% of canvas)
    logo_size = int(size * 0.85)
    logo_resized = logo.resize((logo_size, logo_size), Image.LANCZOS)
    
    # Center the logo
    offset = (size - logo_size) // 2
    canvas.paste(logo_resized, (offset, offset), logo_resized)
    
    # Convert to RGB for PNG output (no transparency needed)
    final = Image.new('RGB', (size, size), BG_COLOR)
    final.paste(canvas, (0, 0), canvas)
    final.save(output_path, 'PNG', optimize=True)
    print(f"  Created {output_path} ({size}x{size})")

def create_maskable_icon(logo: Image.Image, size: int, output_path: str):
    """Create a maskable icon - logo within safe zone (inner 80% = 40% padding radius).
    
    The safe zone for maskable icons is the inner circle with radius 40% of the icon size.
    Content should fit within this area. We use ~65% of the canvas for the logo to stay
    well within the safe zone.
    """
    canvas = Image.new('RGB', (size, size), BG_COLOR)
    
    # Scale logo to fit within safe zone (65% of canvas to stay well within 80% safe area)
    logo_size = int(size * 0.65)
    logo_rgba = logo.resize((logo_size, logo_size), Image.LANCZOS)
    
    # Center the logo
    offset = (size - logo_size) // 2
    
    # Paste with alpha mask
    canvas_rgba = canvas.convert('RGBA')
    canvas_rgba.paste(logo_rgba, (offset, offset), logo_rgba)
    
    final = canvas_rgba.convert('RGB')
    final.save(output_path, 'PNG', optimize=True)
    print(f"  Created {output_path} ({size}x{size}, maskable)")

def create_apple_touch_icon(logo: Image.Image, output_path: str):
    """Create Apple touch icon (180x180) with rounded appearance."""
    size = 180
    canvas = Image.new('RGB', (size, size), BG_COLOR)
    
    logo_size = int(size * 0.75)
    logo_rgba = logo.resize((logo_size, logo_size), Image.LANCZOS)
    
    offset = (size - logo_size) // 2
    
    canvas_rgba = canvas.convert('RGBA')
    canvas_rgba.paste(logo_rgba, (offset, offset), logo_rgba)
    
    final = canvas_rgba.convert('RGB')
    final.save(output_path, 'PNG', optimize=True)
    print(f"  Created {output_path} (180x180, apple-touch)")

def create_favicon(logo: Image.Image, output_path: str):
    """Create a 32x32 favicon PNG."""
    size = 32
    canvas = Image.new('RGBA', (size, size), (*BG_COLOR, 255))
    
    logo_size = int(size * 0.85)
    logo_resized = logo.resize((logo_size, logo_size), Image.LANCZOS)
    
    offset = (size - logo_size) // 2
    canvas.paste(logo_resized, (offset, offset), logo_resized)
    
    final = Image.new('RGB', (size, size), BG_COLOR)
    final.paste(canvas, (0, 0), canvas)
    final.save(output_path, 'PNG', optimize=True)
    print(f"  Created {output_path} (32x32, favicon)")

def create_favicon_ico(logo: Image.Image, output_path: str):
    """Create a multi-size .ico favicon."""
    sizes = [16, 32, 48]
    images = []
    for s in sizes:
        canvas = Image.new('RGBA', (s, s), (*BG_COLOR, 255))
        logo_size = int(s * 0.85)
        logo_resized = logo.resize((logo_size, logo_size), Image.LANCZOS)
        offset = (s - logo_size) // 2
        canvas.paste(logo_resized, (offset, offset), logo_resized)
        images.append(canvas)
    
    images[0].save(output_path, format='ICO', sizes=[(s, s) for s in sizes], append_images=images[1:])
    print(f"  Created {output_path} (ICO multi-size)")

if __name__ == '__main__':
    print("Loading green team logo...")
    logo = Image.open(LOGO_PATH).convert('RGBA')
    print(f"  Logo size: {logo.size}")
    
    print("\nGenerating PWA icons...")
    
    # Regular icons (any purpose)
    create_regular_icon(logo, 192, os.path.join(OUTPUT_DIR, 'pwa-icon-192.png'))
    create_regular_icon(logo, 512, os.path.join(OUTPUT_DIR, 'pwa-icon-512.png'))
    
    # Maskable icons (with safe zone padding)
    create_maskable_icon(logo, 192, os.path.join(OUTPUT_DIR, 'pwa-icon-maskable-192.png'))
    create_maskable_icon(logo, 512, os.path.join(OUTPUT_DIR, 'pwa-icon-maskable-512.png'))
    
    # Apple touch icon
    create_apple_touch_icon(logo, os.path.join(OUTPUT_DIR, 'apple-touch-icon.png'))
    
    # Favicon
    create_favicon(logo, os.path.join(OUTPUT_DIR, 'favicon-32.png'))
    create_favicon_ico(logo, os.path.join(OUTPUT_DIR, 'favicon.ico'))
    
    print("\nDone! All PWA icons generated.")
