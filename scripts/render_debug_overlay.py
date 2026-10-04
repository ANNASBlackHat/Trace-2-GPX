from PIL import Image, ImageDraw
import json
import os

for name in ['kudalumping', 'perahu']:
    json_path = f'.examples/{name}_result.json'
    if not os.path.exists(json_path):
        continue
    with open(json_path) as f:
        data = json.load(f)
    
    orig = Image.open(f'.examples/{name}.jpeg').convert('RGBA')
    overlay = Image.new('RGBA', orig.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    
    path = data['path']
    points = [(p['x'], p['y']) for p in path]
    
    # Draw path in bright magenta with width 4
    if len(points) > 1:
        draw.line(points, fill=(255, 0, 128, 240), width=4)
        # Mark start with green circle
        sx, sy = points[0]
        draw.ellipse([sx-6, sy-6, sx+6, sy+6], fill=(0, 255, 0, 255), outline=(0, 0, 0, 255), width=2)
        # Mark end with yellow circle
        ex, ey = points[-1]
        draw.ellipse([ex-6, ey-6, ex+6, ey+6], fill=(255, 255, 0, 255), outline=(0, 0, 0, 255), width=2)
    
    combined = Image.alpha_composite(orig, overlay)
    out_path = f'.examples/{name}_overlay_current.png'
    combined.save(out_path)
    print(f'Saved debug visualization: {out_path}')
