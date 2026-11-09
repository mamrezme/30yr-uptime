"""Renders the launch assets (assets/launch/) from frames.ts output.

  pip install pillow imageio-ffmpeg
  python3 scripts/launch/render.py fonts   # downloads JetBrains Mono and Inter (OFL) once
  python3 scripts/launch/render.py stills  # cover, gallery and social images
  python3 scripts/launch/render.py video   # demo.mp4 and demo.gif (about two minutes)

Needs bun. The scenes come from hooks/scenes.ts, so the character in these
images is the one the mod draws; the terminal around it is a mock-up.
"""
import json, subprocess, sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, '..', '..')
OUT = os.path.join(REPO, 'assets', 'launch')
FF = None
F = lambda n, s: ImageFont.truetype(os.path.join(HERE, 'fonts', n), s)
MONO = 'fonts/ttf/JetBrainsMono-Regular.ttf'
INTER_B, INTER_XB, INTER_M, INTER_SB, INTER_R = (f'extras/ttf/Inter-{w}.ttf' for w in ('Bold', 'ExtraBold', 'Medium', 'SemiBold', 'Regular'))

TERM_BG = (0x1b, 0x1b, 0x1e)
ORANGE = (0xd9, 0x77, 0x57)
CREAM = (0xf4, 0xef, 0xe8)
MUTED = (0xa8, 0xa0, 0x98)
rgb = lambda c: ((c >> 16) & 255, (c >> 8) & 255, c & 255)
HALVES = {'▀': (True, False), '▄': (False, True), '█': (True, True)}


def bun(*args, cols=88, total=28):
    env = dict(os.environ, COLS=str(cols), TOTAL=str(total))
    return subprocess.run(['bun', os.path.join(HERE, 'frames.ts'), *map(str, args)], capture_output=True, text=True, check=True, cwd=HERE, env=env).stdout


class Term:
    """Draws cell rows at a given cell size."""

    def __init__(self, cw=12, ch=20, size=18):
        self.cw, self.ch = cw, ch
        self.font = F(MONO, size)
        self.cache = {}
        asc, desc = self.font.getmetrics()
        self.dy = (ch - (asc + desc)) // 2

    def glyph(self, c, fg):
        k = (c, fg)
        if k not in self.cache:
            im = Image.new('RGBA', (self.cw * 2, self.ch), (0, 0, 0, 0))
            ImageDraw.Draw(im).text((0, self.dy), c, font=self.font, fill=rgb(fg) + (255,))
            self.cache[k] = im
        return self.cache[k]

    def draw(self, rows, bg=TERM_BG):
        w, h = max(len(r) for r in rows) * self.cw, len(rows) * self.ch
        im = Image.new('RGB', (w, h), bg)
        d = ImageDraw.Draw(im)
        for y, row in enumerate(rows):
            for x, (c, fg, cbg) in enumerate(row):
                x0, y0 = x * self.cw, y * self.ch
                if cbg != -1 and c not in HALVES:
                    d.rectangle([x0, y0, x0 + self.cw - 1, y0 + self.ch - 1], fill=rgb(cbg))
                if c == ' ':
                    continue
                hv = HALVES.get(c)
                if hv:
                    half = self.ch // 2
                    for i, on in enumerate(hv):
                        col = rgb(fg) if on else (rgb(cbg) if cbg != -1 else None)
                        if col:
                            d.rectangle([x0, y0 + i * half, x0 + self.cw - 1, y0 + (i + 1) * half - 1 + (self.ch % 2 if i else 0)], fill=col)
                    continue
                im.paste(self.glyph(c, fg), (x0, y0), self.glyph(c, fg))
        return im


def window(content, title='~/app — claude', pad=18, bar=34, radius=14):
    w, h = content.width + 2 * pad, content.height + 2 * pad + bar
    win = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(win)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius, fill=TERM_BG + (255,), outline=(0x3a, 0x3a, 0x40, 255))
    d.rounded_rectangle([0, 0, w - 1, bar + radius], radius, fill=(0x26, 0x26, 0x2a, 255))
    d.rectangle([0, bar, w - 1, bar + radius], fill=TERM_BG + (255,))
    d.line([0, bar, w, bar], fill=(0x33, 0x33, 0x38, 255))
    for i, c in enumerate([(0xff, 0x5f, 0x57), (0xfe, 0xbc, 0x2e), (0x28, 0xc8, 0x40)]):
        cx = 20 + i * 20
        d.ellipse([cx - 6, bar // 2 - 6, cx + 6, bar // 2 + 6], fill=c)
    f = F(INTER_M, 14)
    tw = d.textlength(title, font=f)
    d.text(((w - tw) / 2, bar / 2), title, font=f, fill=(0x9a, 0x9a, 0xa0), anchor='lm')
    win.paste(content, (pad, bar + pad))
    return win


def backdrop(w, h):
    """A warm dark gradient with a soft orange glow."""
    im = Image.new('RGB', (w, h), (0x14, 0x12, 0x11))
    glow = Image.new('L', (w, h), 0)
    ImageDraw.Draw(glow).ellipse([w * 0.15, h * 0.35, w * 0.85, h * 1.4], fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(min(w, h) // 5))
    im.paste(Image.new('RGB', (w, h), (0x5a, 0x2a, 0x1a)), (0, 0), glow)
    return im


def shadowed(base, win, xy, blur=24, off=10):
    sh = Image.new('RGBA', (win.width + 4 * blur, win.height + 4 * blur), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([2 * blur, 2 * blur, 2 * blur + win.width, 2 * blur + win.height], 16, fill=(0, 0, 0, 170))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    base.paste(sh, (xy[0] - 2 * blur, xy[1] - 2 * blur + off), sh)
    base.paste(win, xy, win)


def pill(base, text, cy, size=26, accent=None):
    d = ImageDraw.Draw(base)
    f = F(INTER_SB, size)
    tw = d.textlength(text, font=f)
    x = (base.width - tw) / 2
    d.rounded_rectangle([x - 22, cy - size * 0.95, x + tw + 22, cy + size * 0.95], size, fill=(0x2a, 0x22, 0x1e), outline=(0x5a, 0x3a, 0x2e))
    d.text((x, cy), text, font=f, fill=CREAM, anchor='lm')


def icon(px):
    im = Image.open(os.path.join(REPO, 'icon.png')).convert('RGB')
    # crop the dark margin away a little and scale with hard edges
    return im.resize((px, px), Image.NEAREST)


def centered(d, text, y, f, fill):
    tw = d.textlength(text, font=f)
    d.text(((d.im.size[0] - tw) / 2, y), text, font=f, fill=fill)


def rounded_icon(px):
    ic = icon(px)
    m = Image.new('L', ic.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, ic.width - 1, ic.height - 1], max(2, ic.width // 6), fill=255)
    return ic, m


def fit(d, text, name, size, maxw):
    """The font `name` at `size`, shrunk until `text` fits in `maxw` pixels."""
    while size > 8 and d.textlength(text, font=F(name, size)) > maxw:
        size -= 1
    return F(name, size)


def brand(im, x, y, size):
    """The product icon and name side by side; `size` is the icon's side. Returns the right edge."""
    ic, m = rounded_icon(size)
    im.paste(ic, (int(x), int(y)), m)
    d = ImageDraw.Draw(im)
    f = F(INTER_XB, int(size * 0.62))
    tx = x + size * 1.22
    d.text((tx, y + size / 2), '30yr-uptime', font=f, fill=CREAM, anchor='lm')
    return tx + d.textlength('30yr-uptime', font=f)


JOKE = 'Under 30? Keep coding like this and your first outage is scheduled for your 30th birthday.'


def end_card(w, h):
    im = backdrop(w, h)
    d = ImageDraw.Draw(im)
    ic, m = rounded_icon(int(h * 0.2))
    im.paste(ic, ((w - ic.width) // 2, int(h * 0.07)), m)
    centered(d, '30yr-uptime', h * 0.30, F(INTER_XB, int(h * 0.1)), CREAM)
    centered(d, '99.9% uptime for your body. For the next 30 years.', h * 0.45, F(INTER_SB, int(h * 0.045)), ORANGE)
    centered(d, JOKE, h * 0.53, fit(d, JOKE, INTER_M, int(h * 0.031), w * 0.86), MUTED)
    f = F(MONO, int(h * 0.033))
    cmd = 'github.com/mamrezme/30yr-uptime'
    tw = d.textlength(cmd, font=f)
    x, y = (w - tw) / 2, h * 0.67
    d.rounded_rectangle([x - 24, y - 16, x + tw + 24, y + h * 0.033 + 18], 10, fill=TERM_BG, outline=(0x3a, 0x3a, 0x40))
    d.text((x, y), cmd, font=f, fill=CREAM)
    centered(d, 'Free & open source  ·  runs locally  ·  zero tokens', h * 0.83, F(INTER_M, int(h * 0.034)), MUTED)
    return im


def hook_card(w, h):
    im = backdrop(w, h)
    d = ImageDraw.Draw(im)
    centered(d, 'Your servers: 99.9% uptime.', h * 0.34, F(INTER_XB, int(h * 0.075)), CREAM)
    centered(d, 'Your spine: no SLA.', h * 0.48, F(INTER_XB, int(h * 0.075)), ORANGE)
    return im


def title_card(w, h):
    im = backdrop(w, h)
    d = ImageDraw.Draw(im)
    size = int(h * 0.14)
    f = F(INTER_XB, int(size * 0.62))
    total = size * 1.22 + d.textlength('30yr-uptime', font=f)
    brand(im, (w - total) / 2, h * 0.3, size)
    centered(d, 'Keep your body at 99.9% uptime for the next 30 years.', h * 0.56, F(INTER_SB, int(h * 0.045)), MUTED)
    return im


def demo_frame(term, fr, W=1280, H=720, bg=None):
    base = (bg or backdrop(W, H)).copy()
    win = window(term.draw(fr['rows']))
    shadowed(base, win, ((W - win.width) // 2, 18))
    if fr['cap']:
        pill(base, fr['cap'], H - 40, 24)
    return base


def video():
    global FF
    FF = __import__('imageio_ffmpeg').get_ffmpeg_exe()
    fps = 30
    lines = bun(fps).splitlines()
    frames = [json.loads(l) for l in lines]
    term = Term()
    W, H = 1280, 720
    bg = backdrop(W, H)
    hook, title, end = hook_card(W, H), title_card(W, H), end_card(W, H)
    mp4 = os.path.join(OUT, 'demo.mp4')
    p = subprocess.Popen([FF, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(fps), '-i', '-',
                          '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], stdin=subprocess.PIPE)
    put = lambda im: p.stdin.write(im.convert('RGB').tobytes())
    first = demo_frame(term, frames[0], W, H, bg)
    HOOK, FADE = int(2.2 * fps), int(0.4 * fps)
    for i in range(HOOK):
        put(hook)
    for i in range(FADE):
        put(Image.blend(hook, title, i / FADE))
    for i in range(int(1.5 * fps)):
        put(title)
    for i in range(FADE):
        put(Image.blend(title, first, i / FADE))
    last = None
    for n, fr in enumerate(frames):
        last = demo_frame(term, fr, W, H, bg)
        put(last)
        if n % 150 == 0:
            print('frame', n, '/', len(frames), file=sys.stderr)
    for i in range(FADE):
        put(Image.blend(last, end, i / FADE))
    for i in range(int(5 * fps)):
        put(end)
    p.stdin.close()
    p.wait()
    gif = os.path.join(OUT, 'demo.gif')
    subprocess.run([FF, '-y', '-loglevel', 'error', '-i', mp4, '-vf',
                    'fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
                    gif], check=True)
    print(mp4, gif)


def still_scene(id, t, width, cw=12, ch=18, size=19):
    rows = json.loads(bun('still', id, t, width))['rows']
    return Term(cw, ch, size).draw(rows)


def shot(t, cols=88, total=28):
    return json.loads(bun('shot', t, cols=cols, total=total))


def stills():
    term = Term()
    # 1. Product Hunt cover / thumbnail 1270x760
    W, H = 1270, 760
    im = backdrop(W, H)
    d = ImageDraw.Draw(im)
    brand(im, 70, 70, 70)
    hf = F(INTER_XB, 46)
    d.text((70, 180), '99.9% uptime for your body,', font=fit(d, '99.9% uptime for your body,', INTER_XB, 46, 540), fill=CREAM)
    d.text((70, 236), 'for the next 30 years.', font=fit(d, '99.9% uptime for your body,', INTER_XB, 46, 540), fill=ORANGE)
    y = 330
    for line in ['Movement breaks while Claude Code works.', '16 animated moves for neck, back, hips,', 'legs, wrists, eyes and lungs.']:
        d.text((72, y), line, font=F(INTER_M, 24), fill=MUTED)
        y += 34
    y += 30
    d.rounded_rectangle([60, y - 14, 590, y + 82], 12, fill=(0x2a, 0x22, 0x1e), outline=(0x5a, 0x3a, 0x2e))
    for line in ['Under 30? At this rate,', 'your back goes down at 30.']:
        d.text((80, y), line, font=F(INTER_SB, 26), fill=ORANGE)
        y += 36
    fr = shot(12.2, cols=56, total=23)
    win = window(Term(10, 17, 15).draw(fr['rows']), title='claude')
    shadowed(im, win, (W - win.width - 46, (H - win.height) // 2 + 6))
    im.save(os.path.join(OUT, 'ph-cover-1270x760.png'))

    # 2. Gallery: the break mid-turn, full terminal
    W, H = 1270, 760
    im = backdrop(W, H)
    fr = shot(12.2, total=27)
    win = window(Term().draw(fr['rows']))
    shadowed(im, win, ((W - win.width) // 2, 20))
    pill(im, 'A break shows up above the spinner while Claude works', H - 46, 23)
    im.save(os.path.join(OUT, 'ph-gallery-1-break.png'))

    # 3. Gallery: all 16 moves
    from math import ceil
    scenes = [('stand', 2200), ('water', 3500), ('walk', 2500), ('eyes', 500), ('breathe', 3000), ('neck', 1700), ('shoulders', 1700), ('thoracic', 2000),
              ('twist', 6000), ('wrists', 14000), ('squat', 1200), ('lunge', 1000), ('glutes', 1200), ('hamstring', 7000), ('calf', 7000), ('hipflexor', 7000)]
    titles = {'stand': 'Stand up', 'water': 'Drink water', 'walk': 'Walk', 'eyes': 'Eye rest', 'breathe': 'Box breathing', 'neck': 'Chin tucks', 'shoulders': 'Shoulder squeeze',
              'thoracic': 'Back extension', 'twist': 'Seated twist', 'wrists': 'Wrist stretches', 'squat': 'Squats', 'lunge': 'Lunges', 'glutes': 'Glute kickbacks',
              'hamstring': 'Hamstrings', 'calf': 'Calf stretch', 'hipflexor': 'Hip flexors'}
    im = backdrop(W, H)
    d = ImageDraw.Draw(im)
    centered(d, "16 moves. One for every part of you that's about to fail.", 34, F(INTER_B, 34), CREAM)
    cols, gx, gy, cw_, ch_ = 4, 24, 20, 284, 140
    x0 = (W - (cols * cw_ + (cols - 1) * gx)) // 2
    for i, (sid, t) in enumerate(scenes):
        sc = still_scene(sid, t, 54, 5, 10, 8)
        cx, cy = x0 + (i % cols) * (cw_ + gx), 100 + (i // cols) * (ch_ + gy)
        d.rounded_rectangle([cx, cy, cx + cw_, cy + ch_], 12, fill=TERM_BG, outline=(0x3a, 0x3a, 0x40))
        im.paste(sc, (cx + (cw_ - sc.width) // 2, cy + 6))
        centered_x = cx + (cw_ - d.textlength(titles[sid], font=F(INTER_SB, 17))) / 2
        d.text((centered_x, cy + ch_ - 27), titles[sid], font=F(INTER_SB, 17), fill=CREAM)
    im.save(os.path.join(OUT, 'ph-gallery-2-moves.png'))

    # 4. Gallery: how it works
    im = backdrop(W, H)
    d = ImageDraw.Draw(im)
    centered(d, 'How it works', 40, F(INTER_XB, 46), CREAM)
    items = [('15s', 'A turn runs past 15s, or 30 min pass: a break shows up.'),
             ('/break', 'Want one now? /break. Need focus? /break off.'),
             ('Done', 'Done, In 5 min, or Skip. No streaks, no guilt, no stats.'),
             ('/break set', 'Pick your moves and timings: /break set squat off'),
             ('local', 'Runs in your terminal. No network, no model calls, zero tokens.')]
    y = 130
    for k, v in items:
        f = F(MONO, 26)
        d.rounded_rectangle([110, y, 300, y + 70], 12, fill=TERM_BG, outline=(0x5a, 0x3a, 0x2e))
        tw = d.textlength(k, font=f)
        d.text((205 - tw / 2, y + 35), k, font=f, fill=ORANGE, anchor='lm')
        d.text((340, y + 35), v, font=F(INTER_M, 27), fill=CREAM, anchor='lm')
        y += 100
    centered(d, 'SLA: 99.9% uptime for 30 years. Your lower back included.', H - 72, F(INTER_SB, 28), ORANGE)
    im.save(os.path.join(OUT, 'ph-gallery-3-how.png'))

    # 5. Social: X 1600x900 and LinkedIn 1200x627
    for name, (W, H) in [('x-1600x900', (1600, 900)), ('linkedin-1200x627', (1200, 627))]:
        im = backdrop(W, H)
        d = ImageDraw.Draw(im)
        s = H / 900
        X, maxw = int(80 * s), int(720 * s)
        brand(im, X, int(70 * s), int(64 * s))
        d.text((X, int(180 * s)), 'Your code has 99.9% uptime.', font=fit(d, 'Your code has 99.9% uptime.', INTER_XB, int(54 * s), maxw), fill=CREAM)
        d.text((X, int(250 * s)), 'Your body should too,', font=fit(d, 'Your code has 99.9% uptime.', INTER_XB, int(54 * s), maxw), fill=ORANGE)
        d.text((X, int(320 * s)), 'for the next 30 years.', font=fit(d, 'Your code has 99.9% uptime.', INTER_XB, int(54 * s), maxw), fill=ORANGE)
        y = int(440 * s)
        for line in ['Under 30 and shipping 10 hours a day in a chair?', "Your body's first outage is booked", 'for your 30th birthday.']:
            d.text((X, y), line, font=F(INTER_M, int(28 * s)), fill=MUTED)
            y += int(40 * s)
        d.text((X, int(600 * s)), 'Movement breaks while Claude Code works.', font=F(INTER_SB, int(28 * s)), fill=CREAM)
        d.text((X, int(670 * s)), 'github.com/mamrezme/30yr-uptime', font=F(MONO, int(26 * s)), fill=ORANGE)
        fr = shot(12.2, cols=56, total=23)
        win = window(Term(round(12 * s), round(20 * s), round(18 * s)).draw(fr['rows']), title='claude')
        shadowed(im, win, (W - win.width - int(60 * s), (H - win.height) // 2))
        im.save(os.path.join(OUT, f'{name}.png'))
    print('stills done')


def fonts():
    import io, urllib.request, zipfile
    for url, names in [('https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip', [MONO]),
                       ('https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip', [INTER_B, INTER_XB, INTER_M, INTER_SB, INTER_R])]:
        z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(url).read()))
        for n in names:
            z.extract(n, os.path.join(HERE, 'fonts'))
    print('fonts in', os.path.join(HERE, 'fonts'))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    {'video': video, 'stills': stills, 'fonts': fonts}[sys.argv[1]]()
