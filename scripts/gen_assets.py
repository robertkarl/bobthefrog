#!/usr/bin/env python3
"""M8 art-asset pipeline for Unbiased Bob Challenge.

Generates the game's art from the ComfyUI server at 192.168.50.151:8188
(Qwen-Image 2.1). Workflow graph cloned from the server's /api/history
template (see ASSETS.md). Stdlib only.

Subcommands:
  submit   submit all t2i jobs, record prompt_ids in /tmp/btf_state.json
  poll     check /api/history, download finished images into assets/fullres/
  squish   i2i job: squished Bob from the generated bob.png (upload+submit+poll)
  finish   sips resize/crop into assets/sprites + assets/tiles, copy screens,
           write assets/MANIFEST.md
"""
import json, sys, time, uuid, urllib.request, urllib.parse, pathlib, subprocess

BASE = "http://192.168.50.151:8188"
ROOT = pathlib.Path("/tmp/btf-wt-assets")
STATE = pathlib.Path("/tmp/btf_state.json")

STYLE = ("flat 2D cartoon video-game art, top-down view, bold clean dark outlines, "
         "flat saturated colors, simple shapes, no text, no letters, no watermark, "
         "no border, no photograph, no 3d, no realistic shading")
NEG = ("text, letters, words, watermark, signature, border, frame, photograph, "
       "3d render, blurry, extra limbs, extra fingers")

# name -> (prompt, width, height, seed, final layout)
ASSETS = {
    "bob": ("a single cheerful cartoon frog, top-down view from directly above, bright green, big round eyes, compact body, centered, on a solid pure cyan background, nothing else in the image",
             1024, 1024, 81000001, "sprites/bob.png"),
    "car": ("a single small cartoon car, top-down view, facing left, compact two-seat hatchback, red body, centered, solid pure cyan background",
             1024, 1024, 81000002, "sprites/car.png"),
    "truck": ("a single cartoon box truck, top-down view, facing left, long rectangular cargo box with a small cab at the front, 2:1 length ratio, centered, solid pure cyan background",
              1024, 512, 81000003, "sprites/truck.png"),
    "grass": ("seamless top-down grass texture, fine uniform cartoon grass, even lighting, fills the whole image edge to edge",
              1024, 1024, 81000004, "tiles/grass.png"),
    "asphalt": ("seamless top-down dark asphalt road texture, subtle wear, no lane markings, fills the whole image",
                1024, 1024, 81000005, "tiles/asphalt.png"),
    "sidewalk": ("seamless top-down light gray sidewalk texture, faint slab lines, fills the whole image",
                 1024, 1024, 81000006, "tiles/sidewalk.png"),
    "water": ("seamless top-down river water texture, medium blue, gentle horizontal wave streaks, fills the whole image",
              1024, 1024, 81000007, "tiles/water.png"),
    "bush": ("a single round cartoon bush, top-down, dark green, centered, solid pure cyan background",
             1024, 1024, 81000008, "sprites/bush.png"),
    "pylon": ("a single utility pole seen from directly above, small dark square with a cross mark, centered, solid pure cyan background",
              1024, 1024, 81000009, "sprites/pylon.png"),
    "lilypad": ("a single round green lily pad with one small flower, top-down, centered, solid pure cyan background",
               1024, 1024, 81000010, "sprites/lilypad.png"),
    "localhost_lilypad": ("a special glowing golden-rimmed lily pad, top-down, subtle glow, clearly more ornate than a normal pad, centered, solid pure cyan background",
                           1024, 1024, 81000011, "sprites/localhost_lilypad.png"),
    "title": ("cartoon game title scene: a bright green frog leaping over a road with cars, a river with lily pads behind, wide cheerful composition, no text",
              1024, 1024, 81000012, "screens/title.png"),
    "gameover": ("a battered squished cartoon frog on a road, comedic and dramatic, single character centered, no text",
                1024, 1024, 81000013, "screens/gameover.png"),
    "cover": ("hero cover art: frog mid-leap over traffic and a river, dynamic, bold cartoon style, no text",
             1024, 1024, 81000014, "screens/cover.png"),
}

SQUISHED = ("the same frog, squashed completely flat like a pancake, sad wide eyes, same cartoon style, same palette, solid pure cyan background",
            1024, 1024, 81000015, "sprites/bob_squished.png")


def graph(prompt_text, seed, w, h, denoise=1.0, i2i_image=None):
    latent = ["474", 2] if i2i_image else ["456", 0]
    g = {
        "451": {"class_type": "UnetLoaderGGUF",
                "inputs": {"unet_name": "qwen-image-2.1-Q4_K_M.gguf"}},
        "453": {"class_type": "CLIPLoaderGGUF",
                "inputs": {"clip_name": "Qwen3-VL-8B-Instruct-UD-Q4_K_XL.gguf",
                           "type": "qwen_image"}},
        "454": {"class_type": "VAELoader",
                "inputs": {"vae_name": "qwen_image_2.1_vae_bf16.safetensors"}},
        "456": {"class_type": "EmptyLatentImage",
                "inputs": {"width": w, "height": h, "batch_size": 1}},
        "457": {"class_type": "VAEDecode",
                "inputs": {"samples": ["458", 0], "vae": ["454", 0]}},
        "458": {"class_type": "KSampler",
                "inputs": {"seed": seed, "steps": 25, "cfg": 1.0,
                           "sampler_name": "euler", "scheduler": "simple",
                           "denoise": denoise,
                           "model": ["469", 0],
                           "positive": ["474", 0],
                           "negative": ["474", 1],
                           "latent_image": ["468", 0]}},
        "468": {"class_type": "ComfySwitchNode",
                "inputs": {"switch": False, "on_false": latent}},
        "469": {"class_type": "QwenImage21Cache",
                "inputs": {"device": "auto", "dtype": "default",
                           "model": ["451", 0]}},
        "474": {"class_type": "TextEncodeQwenImage21",
                "inputs": {"clip": ["453", 0],
                           "prompt": prompt_text + ", " + STYLE,
                           "negative_prompt": NEG,
                           "resolution": 1024,
                           "vae": ["454", 0]}},
        "461": {"class_type": "SaveImageAdvanced",
                "inputs": {"filename_prefix": "bobfrog_%ASSET%",
                           "format": "png",
                           "format.bit_depth": "8-bit",
                           "format.input_color_space": "sRGB",
                           "images": ["457", 0]}},
    }
    if i2i_image:
        g["900"] = {"class_type": "LoadImage", "inputs": {"image": i2i_image}}
        g["474"]["inputs"]["images"] = {"image_1": ["900", 0]}
    return g


def submit_one(name, prompt, w, h, seed, i2i_image=None, denoise=1.0):
    g = graph(prompt, seed, w, h, denoise=denoise, i2i_image=i2i_image)
    g["461"]["inputs"]["filename_prefix"] = "bobfrog_" + name
    req = urllib.request.Request(
        BASE + "/api/prompt",
        data=json.dumps({"prompt": g}).encode(),
        headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))["prompt_id"]


def load_state():
    return json.loads(STATE.read_text()) if STATE.exists() else {}

def save_state(s):
    STATE.write_text(json.dumps(s, indent=1))


def download_image(img, out):
    url = (BASE + "/api/view?filename=%s&subfolder=%s&type=%s" % (
        urllib.parse.quote(img["filename"]),
        urllib.parse.quote(img.get("subfolder", "")),
        img.get("type", "output")))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(urllib.request.urlopen(url).read())


def cmd_submit():
    state = load_state()
    for name, (prompt, w, h, seed, dest) in ASSETS.items():
        if state.get(name, {}).get("done"):
            continue
        pid = submit_one(name, prompt, w, h, seed)
        state[name] = {"prompt_id": pid, "done": False, "seed": seed}
        print("submitted", name, pid)
    save_state(state)


def cmd_poll():
    state = load_state()
    hist = json.load(urllib.request.urlopen(BASE + "/api/history"))
    queue = json.load(urllib.request.urlopen(BASE + "/api/queue"))
    queued = set(queue.get("queue_running", []) + queue.get("queue_pending", []))
    for name, info in list(state.items()):
        if info["done"]:
            continue
        pid = info["prompt_id"]
        if pid in hist:
            entry = hist[pid]
            imgs = []
            for node, data in entry.get("outputs", {}).items():
                imgs += data.get("images", [])
            if imgs:
                download_image(imgs[0], ROOT / "assets" / "fullres" / (name + ".png"))
                info["done"] = True
                print("downloaded", name, imgs[0]["filename"])
    save_state(state)
    pending = [n for n, i in state.items() if not i["done"]]
    missing = [n for n in pending
               if state[n]["prompt_id"] not in hist and state[n]["prompt_id"] not in queued]
    print("pending:", pending)
    if missing:
        print("NOT FOUND in history or queue (likely failed):", missing)
    return 0 if not pending else 1


def upload_file(path):
    b = uuid.uuid4().hex
    data = path.read_bytes()
    parts = (
        f"--{b}\r\nContent-Disposition: form-data; name=\"name\"\r\n\r\n{path.name}\r\n"
        f"--{b}\r\nContent-Disposition: form-data; name=\"type\"\r\n\r\nimage\r\n"
        f"--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{path.name}\"\r\n"
        f"Content-Type: application/octet-stream\r\n\r\n").encode() + data + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(BASE + "/api/upload", data=parts,
                                 headers={"Content-Type": f"multipart/form-data; boundary={b}"})
    return json.load(urllib.request.urlopen(req))["name"]


def cmd_squish():
    state = load_state()
    if state.get("bob_squished", {}).get("done"):
        print("bob_squished already done")
        return
    bob_src = ROOT / "assets" / "fullres" / "bob.png"
    if not bob_src.exists():
        sys.exit("bob.png full-res not present yet")
    up = upload_file(bob_src)
    prompt, w, h, seed, dest = SQUISHED
    pid = submit_one("bob_squished", prompt, w, h, seed, i2i_image=up, denoise=0.6)
    state["bob_squished"] = {"prompt_id": pid, "done": False, "seed": seed}
    save_state(state)
    print("submitted bob_squished", pid, "from", up)


def sips(args):
    subprocess.run(["sips"] + args, check=True)


def cmd_finish():
    state = load_state()
    for name, (prompt, w, h, seed, dest) in list(ASSETS.items()) + [("bob_squished", SQUISHED)]:
        src = ROOT / "assets" / "fullres" / (name + ".png")
        if not src.exists():
            print("MISSING full-res:", name)
            continue
        outdir = ROOT / "assets" / dest.rsplit("/", 1)[0]
        outdir.mkdir(parents=True, exist_ok=True)
        out = ROOT / "assets" / dest
        if name == "truck":
            sips(["-z", "64", "128", str(src), "--out", str(out)])
        elif dest.startswith("screens/"):
            out.write_bytes(src.read_bytes())
        elif dest.startswith("tiles/"):
            sips(["--cropToHeightWidth", "64", "64", str(src), "--out", str(out)])
        else:
            sips(["-z", "64", "64", str(src), "--out", str(out)])
        print("wrote", out)
    write_manifest()


def write_manifest():
    lines = [
        "# Asset Manifest — Unbiased Bob Challenge (M8)",
        "",
        "Generated with the ComfyUI server at `192.168.50.151:8188` (Qwen-Image 2.1,",
        "`qwen-image-2.1-Q4_K_M.gguf` + `Qwen3-VL-8B-Instruct-UD-Q4_K_XL` text encoder +",
        "`qwen_image_2.1_vae_bf16`; euler sampler, 25 steps, cfg 1.0). Workflow cloned",
        "from the server's `/api/history` template (see `ASSETS.md`).",
        "",
        "Shared style suffix (appended to every prompt):",
        f"> {STYLE}",
        "",
        "Shared negative prompt:",
        f"> {NEG}",
        "",
        "Full-resolution originals: `assets/fullres/`. In-game assets are sips-resized",
        "to 64 px (truck 128x64) under `assets/sprites/` and `assets/tiles/`; screens",
        "are kept at full resolution in `assets/screens/`. Cyan-background sprites are",
        "keyed out at load time.",
        "",
        "| Asset | Prompt | Seed | Output |",
        "|---|---|---|---|",
    ]
    for name, (prompt, w, h, seed, dest) in list(ASSETS.items()) + [("bob_squished", SQUISHED)]:
        note = " (i2i from bob.png, denoise 0.6)" if name == "bob_squished" else ""
        lines.append(f"| {name} | {prompt}{note} | {seed} | `assets/{dest}` |")
    (ROOT / "assets" / "MANIFEST.md").write_text("\n".join(lines) + "\n")
    print("wrote assets/MANIFEST.md")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "poll"
    {"submit": cmd_submit, "poll": cmd_poll, "squish": cmd_squish,
     "finish": cmd_finish}[cmd]()