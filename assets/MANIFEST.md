# Asset Manifest — Unbiased Bob Challenge (M8)

Generated with the ComfyUI server at `192.168.50.151:8188` (Qwen-Image 2.1:
`qwen-image-2.1-Q4_K_M.gguf` UNet + `Qwen3-VL-8B-Instruct-UD-Q4_K_XL` text encoder +
`qwen_image_2.1_vae_bf16` VAE; euler sampler, 25 steps, cfg 1.0). Workflow graph
cloned from the server's `/api/history` template; prompts/seeds in
`scripts/gen_assets.py`.

Shared style suffix (appended to every prompt):
> flat 2D cartoon video-game art, top-down view, bold clean dark outlines, flat saturated colors, simple shapes, no text, no letters, no watermark, no border, no photograph, no 3d, no realistic shading

Shared negative prompt:
> text, letters, words, watermark, signature, border, frame, photograph, 3d render, blurry, extra limbs, extra fingers

Layout: full-resolution originals live in `assets/fullres/` (1024×1024, except
truck 1024×1024). In-game sprites/tiles are `sips`-resized to 64×64 (truck kept
2:1 at 128×64) in `assets/sprites/`. Screens are kept at full resolution in
`assets/screens/` with 512×512 versions alongside. Cyan-background sprites are
keyed out at load time.

| Asset | Prompt | Seed | Full-res output | In-game output (size) |
|---|---|---|---|---|
| bob | a single cheerful cartoon frog, top-down view from directly above, bright green, big round eyes, compact body, centered, on a solid pure cyan background, nothing else in the image | 81000001 | `assets/fullres/bob.png` (1024×1024) | `assets/sprites/bob.png` (64×64) |
| car | a single small cartoon car, top-down view, facing left, compact two-seat hatchback, red body, centered, solid pure cyan background | 81000002 | `assets/fullres/car.png` (1024×1024) | `assets/sprites/car.png` (64×64) |
| truck | a single cartoon box truck, top-down view, facing left, long rectangular cargo box with a small cab at the front, 2:1 length ratio, centered, solid pure cyan background | 81000003 | `assets/fullres/truck.png` (1024×1024) | `assets/sprites/truck.png` (128×64) |
| grass | seamless top-down grass texture, fine uniform cartoon grass, even lighting, fills the whole image edge to edge | 81000004 | `assets/fullres/grass.png` (1024×1024) | `assets/sprites/grass.png` (64×64 tile) |
| asphalt | seamless top-down dark asphalt road texture, subtle wear, no lane markings, fills the whole image | 81000005 | `assets/fullres/asphalt.png` (1024×1024) | `assets/sprites/asphalt.png` (64×64 tile) |
| sidewalk | seamless top-down light gray sidewalk texture, faint slab lines, fills the whole image | 81000006 | `assets/fullres/sidewalk.png` (1024×1024) | `assets/sprites/sidewalk.png` (64×64 tile) |
| water | seamless top-down river water texture, medium blue, gentle horizontal wave streaks, fills the whole image | 81000007 | `assets/fullres/water.png` (1024×1024) | `assets/sprites/water.png` (64×64 tile) |
| bush | a single round cartoon bush, top-down, dark green, centered, solid pure cyan background | 81000008 | `assets/fullres/bush.png` (1024×1024) | `assets/sprites/bush.png` (64×64) |
| pylon | a single utility pole seen from directly above, small dark square with a cross mark, centered, solid pure cyan background | 81000009 | `assets/fullres/pylon.png` (1024×1024) | `assets/sprites/pylon.png` (64×64) |
| lilypad | a single round green lily pad with one small flower, top-down, centered, solid pure cyan background | 81000010 | `assets/fullres/lilypad.png` (1024×1024) | `assets/sprites/lilypad.png` (64×64) |
| localhost_lilypad | a special glowing golden-rimmed lily pad, top-down, subtle glow, clearly more ornate than a normal pad, centered, solid pure cyan background | 81000011 | `assets/fullres/localhost_lilypad.png` (1024×1024) | `assets/sprites/localhost_lilypad.png` (64×64) |
| title | cartoon game title scene: a bright green frog leaping over a road with cars, a river with lily pads behind, wide cheerful composition, no text | 81000012 | `assets/fullres/title.png` (1024×1024) | `assets/screens/title.png` (1024×1024), `assets/screens/title_512.png` (512×512) |
| gameover | a battered squished cartoon frog on a road, comedic and dramatic, single character centered, no text | 81000013 | `assets/fullres/gameover.png` (1024×1024) | `assets/screens/gameover.png` (1024×1024), `assets/screens/gameover_512.png` (512×512) |
| cover | hero cover art: frog mid-leap over traffic and a river, dynamic, bold cartoon style, no text | 81000014 | `assets/fullres/cover.png` (1024×1024) | `assets/screens/cover.png` (1024×1024), `assets/screens/cover_512.png` (512×512) |