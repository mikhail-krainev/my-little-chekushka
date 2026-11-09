#!/usr/bin/env python3
"""Turns green-screen meme footage into talking-face clips for the mascot.

usage: python3 -I tools/make_phrases.py <footage_dir> <app_dir>

For every entry in CLIPS it cuts the phrase once (the source videos loop the phrase, only the first take is used),
writes `assets/phrases/<key>.ogg` and a pixelated face sprite sheet `assets/phrases/<key>.png`
(frames side by side, FACE_W x FACE_H art pixels each), and finally `src/phrase-clips.mjs` with the clip table.

The face in the video is tracked (OpenCV Haar cascade), keyed, colour-matched to the mascot's own face, cut to the
silhouette of the mascot's head and pixelated on the same art grid as the body sprite, so it replaces the face
without redrawing the bottle.
"""
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image

FPS = 12
PALETTE_COLORS = 48
COLOR_MATCH = np.array([0.6, 1.0, 1.0])   # per Lab channel: 0 keeps the video's lighting, 1 takes the mascot face's tones
SUPERSAMPLE = 6                 # video pixels gathered per art pixel before averaging
HEAD_TOP_REACH = 0.9             # a face starts at most this many face heights below the top of the subject
HEAD_INSET = 3                  # art pixels of glass left visible around the swapped face

# Head box on the body sprite (art pixels, y down): hair top to chin, ear to ear.
FACE_X, FACE_Y, FACE_W, FACE_H = 17, 20, 50, 63

# key, file id, start, end (seconds), caption
CLIPS = [
    ("vozna", "7675794474001304839", 0.00, 1.25, "Пошла валютная возня"),
    ("babok", "7673851209438055688", 0.00, 2.75, "Бабок, сука, больше нет. Блядь."),
    ("nihuya", "7686195602824154386", 0.20, 3.50, "Нихуя себе. И вправду потужненько."),
    ("dura", "7662697452247452946", 0.10, 2.10, "Сядь, дура толстая!"),
    ("zhivoy", "7704617099263511860", 0.00, 2.80, "Живой"),
    ("bystree", "7667997456310734088", 0.15, 0.90, "Быстрее!"),
    ("ne_govori", "7668343039382785287", 0.00, 2.75, "Не говори таких слов при мне, блядь."),
    ("baba", "7679539283560041735", 0.05, 1.75, "Баба, блядь."),
    ("pizdec", "7682385969567370504", 0.25, 1.85, "Да ну нахуй, да это пиздец!"),
    ("detka", "7684374952472087826", 0.00, 3.85, "О да, у да, детка, ты такая сладкая конфетка."),
    ("stavki", "7684396539317325074", 0.15, 5.30, "Только ставки: футбол, хуйбол, спермобол, бурмалдобол, полибол, пиздобол."),
    ("babki", "7684596012136123656", 0.00, 3.80, "Бабки рулятся, движуха мутится."),
    ("korova", "7684995975026396434", 0.35, 3.00, "Да пошла ты нахуй, блядь, корова ебаная!"),
    ("kommentirovat", "7686172601479122183", 0.00, 2.00, "Я не знаю, как это комментировать, блядь."),
    ("pohuy", "7690971839379606791", 0.00, 1.60, "Да похуй, ну и ладно."),
    ("no", "7692141971338448135", 0.15, 1.40, "НО!"),
    ("tancuem", "7695771577178279175", 0.60, 3.80, "Танцуем все! О да! О да!"),
    ("molchat", "7696613984690081032", 5.95, 8.10, "Молчать, блядь."),
    ("normaldy", "7701699568097824007", 0.15, 3.85, "Ха-ха-ха! Это пизда! И ведь нормалды!"),
    ("miliciya", "7701010927805631752", 2.35, 4.75, "Суд! Милиция! Помогите!"),
    ("pyos", "7694969530531220744", 0.15, 2.80, "Да иди ты нахуй, ты иди нахуй, пёс моя паршивая, блядь."),
    ("eblan", "7693555934232055092", 0.30, 1.75, "Блин, ты чё, еблан?"),
    ("bayu", "7679108125051374856", 0.30, 3.00, "Ох, баёшечки, баёшечки, вот эта хуйня."),
    ("den_shestoy", "7661188150248770823", 0.20, 7.50, "День шестой: мы проигрываем всё больше и больше, но мы не отчаиваемся и будем идти вперёд."),
    ("zhestko", "7681704901583359239", 0.05, 2.20, "Блядь, это жёстко!"),
    ("poebat", "7701756559222689031", 0.05, 5.60, "Сегодня это сделать? Ну, точнее, сейчас или, блядь, потом? Мне как-то поебать вообще."),
    ("baba_dyrka", "7691022808859544839", 0.00, 5.80, "О, баба! Баба дырка! Ооо, заебись."),
    ("fu", "7690943943395020050", 1.60, 5.00, "Что это за хуйня, блядь? Фу, блядь."),
    ("polnaya", "7694311675066912001", 0.00, 5.00, "Блядь, это просто полная пизда, беда, смотрите на это, это просто пиздец!"),
    ("angel", "7687605731859729682", 0.00, 6.40, "Буду ангелом твоим навсегда. Ты не бойся ночи, ведь я рядом."),
    ("palaich", "7689187059080269064", 0.10, 5.40, "Кто такой Палыч? А кто такой Деп Сергеевич? Хуй узнает вообще."),
    ("klyuch", "7696553540038216978", 0.15, 3.85, "Что подарить бате? Огромный ключ нахуй на 50."),
    ("ty_tut", "7668274207574347026", 0.10, 4.45, "Привет, ты тут? Я тут. Привет, спишь? Привет, не сплю."),
    ("tualet", "7696931678517775624", 5.85, 7.80, "Мы не умрём в туалете. Мы не умрём."),
    ("monitor", "7697745490028350728", 2.85, 7.75, "Каждый день хочется разбить монитор, хочется послать всех нахуй."),
    ("privet", "7661033703174393106", 0.15, 8.85, "Привет, дорогие зрители и подписчики этого канала! С вами Меллстрой, и мы продолжаем азартные приключения."),
    # second batch
    ("o_blyat", "7561760721915268359", 0.00, 1.60, "О, блядь."),
    ("rebyata", "7663601619233246482", 0.00, 7.90, "Ребята, ребята, всем привет! С вами блогер Меллстрой, мы играем вместе… А ладно, всё, похуй на меня, я понял."),
    ("bandera", "7671969087269981447", 0.00, 7.36, "Бандера? Так я же его знаю, нахуй. Это же этот ютубер, блядь. Вот он, Майнкрафт снимал, блядь, вот он."),
    ("zhirny", "7674258571969694994", 0.00, 5.44, "Здорово, жирный! Спасибо большое за комплименты, Альберт. Несмотря даже на эти оскорбления, я всё равно рад тебя видеть."),
    ("aaa", "7676259865311857927", 0.00, 3.20, "А! А! А! Бля! А! Бля!"),
    ("pantera", "7677008468938722567", 0.00, 7.96, "Танцуй, пантера. Да я не ебу, я не понял вообще… Какая-то нахуй пантера, хуй пойми, что это вообще такое, блядь."),
    ("baba_suka", "7682037836119330055", 0.00, 5.24, "Писю, писю… Баба, блядь, баба, сука! Сука ты, а не баба."),
    ("zhizn", "7685370294600617234", 0.00, 6.96, "Бля, ёбаная жизнь, чтоб ты, сука, сдохла нахуй. Нахуй ты мне такие испытания даёшь?"),
    ("kashiki", "7686092345682545938", 0.00, 6.48, "Аааа, Мастерай, это ты? А я въебал в кашики нахуй."),
    ("ne_zhri", "7686154213922983175", 0.00, 3.28, "Бля, только, пожалуйста, не жри как не в себя, сука."),
    ("specnaz", "7686386775371042066", 0.00, 2.60, "Работай, спецназ! Работай, спецназ!"),
    ("parashyut", "7688668972325080327", 0.00, 3.78, "Прыгнуть с парашютом? На залупе я могу прыгнуть!"),
    ("eto_on", "7689805512803618055", 0.00, 6.08, "Это он, это он, это реально он! Это реально он! Быстрее!"),
    ("shut_master", "7689938656353635591", 0.00, 4.90, "Шут-мастер, шут-мастер, шут-мастер."),
    ("kak_chlen", "7690232061428403474", 0.00, 6.44, "Андрей, как ваш член? Спасибо, хорошо."),
    ("poroshki", "7690540811456466184", 0.00, 6.28, "Лучше этих порошков подрочить и кончить нахуй на мыло. Зубную пасту, нахуй, блядь. Какую-нибудь тёлку."),
    ("pavlov", "7691387895659252998", 0.00, 7.12, "Здравствуйте, Андрей! Я Павлов Алексей Алексеевич. Рад знакомству. Взаимно."),
    ("policiya", "7691680120347708690", 0.00, 8.50, "Пизда мне. Меня нашла полиция по запросу Украины у этих казахстанцев, и мне пизда."),
    ("chto_delat", "7693206941119679762", 0.00, 5.06, "Что, блядь, нужно делать, нахуй? Ты просто реально расскажи."),
    ("olivie", "7694293386529983751", 0.00, 2.98, "Баба, где то оливье, которое мне нравилось? Где то оливье, которое мне нравилось?"),
    ("tiktoker", "7694671352086793480", 0.00, 2.74, "Меллстрой? Чё? Тиктокер ты мой, друг."),
    ("druzhit", "7695472803679603975", 0.00, 5.52, "Дружить не хочешь? О, хочешь, блядь! Подожди, нахуй, найс, найс!"),
    ("zaebal", "7695871102471490837", 0.00, 4.98, "Ну да, пиздец, блядь, давай, нахуй, выдай, блядь. Заебал, урод ты, блядь, заморский!"),
    ("nu_voznya", "7696912859778796818", 0.00, 1.30, "Ну, пошла возня."),
    ("maks_summa", "7697315108321496336", 0.00, 9.34, "Блядь, вы достигли максимальной суммы, которую можно получить. Ебать. Да ну нахуй."),
    ("dai_ego", "7701042671787199751", 0.00, 5.24, "Бля, дай его, дай его, блядь, говорю! Сука, дай его, нахуй, я сказал!"),
    ("ne_volnuysya", "7701349717581516039", 0.00, 4.32, "Не волнуйся, маленький, всё будет хорошо."),
    ("nastya", "7701380066571422984", 0.00, 6.56, "Я хочу сделать комплимент Насте. У неё пизда красивая. Да, похоже на персик."),
    ("pochemu", "7701684537989827858", 0.00, 5.16, "Почему ты, блядь, ну, типа… Ну нет, я…"),
    ("klik", "7701762046991338759", 0.00, 7.24, "Я реально прошу вас: вам это один ебаный клик, а я сломал колени."),
    ("degradaciya", "7705091110380653832", 0.00, 2.62, "Седьмая стадия деградации: когнитивный спад."),
    ("normalno", "7705502034677583111", 0.00, 1.00, "Нормально всё?"),
]


def key_green(bgr):
    """Alpha 0 on the green screen, 1 on the subject, with the green fringe removed (same key as make_sprites.py)."""
    im = bgr[..., ::-1].astype(float)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    alpha = np.clip(1 - ((g - np.maximum(r, b)) - 30) / 110, 0, 1)
    g = np.minimum(g, np.maximum(r, b) + 6)
    return np.dstack([r, g, b]), alpha


def read_frames(path, start, end):
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise SystemExit(f"cannot open {path}")
    src_fps = cap.get(cv2.CAP_PROP_FPS)
    wanted = [start + i / FPS for i in range(int(round((end - start) * FPS)))]
    frames, index, frame = [], 0, None
    for t in wanted:
        target = int(round(t * src_fps))
        while index <= target:
            ok, frame = cap.read()
            if not ok:
                break
            index += 1
        if frame is None:
            raise SystemExit(f"{path}: no frame at {t:.2f}s")
        frames.append(frame.copy())
    cap.release()
    return frames


def load_detectors():
    """Frontal cascades plus the profile cascade on the frame and its mirror (it only finds faces turned one way)."""
    root = cv2.data.haarcascades
    load = lambda name: cv2.CascadeClassifier(os.path.join(root, name))
    profile = load("haarcascade_profileface.xml")
    return [(load("haarcascade_frontalface_default.xml"), False), (load("haarcascade_frontalface_alt2.xml"), False),
            (profile, False), (profile, True)]


def face_candidates(grey, detectors):
    width = grey.shape[1]
    for cascade, mirrored in detectors:
        image = cv2.flip(grey, 1) if mirrored else grey
        for x, y, w, h in cascade.detectMultiScale(image, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80)):
            yield (width - x - w if mirrored else x), y, w, h


def silhouette_top(alpha, cx, w, bottom):
    """Topmost solid row of the keyed subject above `bottom`, in a narrow column around `cx`."""
    column = alpha[: max(1, bottom), max(0, int(cx) - w // 6): int(cx) + w // 6 + 1].mean(axis=1)
    solid = np.nonzero(column > 0.5)[0]
    return solid[0] if len(solid) else None


def is_head(alpha, x, y, w, h):
    """Rejects false hits: a face is on the subject, and near the top of it (not a print on the shirt)."""
    cx, cy = x + w // 2, y + h // 2
    if alpha[min(cy, alpha.shape[0] - 1), min(cx, alpha.shape[1] - 1)] < 0.5:
        return False
    top = silhouette_top(alpha, cx, w, cy)
    return top is not None and y - top <= HEAD_TOP_REACH * h


def head_box(frame, alpha, detectors):
    """(cx, top, chin, width) of the head in video pixels, or None when no face is found."""
    grey = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = [f for f in face_candidates(grey, detectors) if is_head(alpha, *f)]
    if not faces:
        return None
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    cx = x + w / 2
    top = silhouette_top(alpha, cx, w, y + h // 2)
    row = np.nonzero(alpha[int(y + h * 0.45), max(0, x - w // 2): x + w + w // 2] > 0.5)[0]
    span = row[-1] - row[0] if len(row) else 0
    width = span if w * 0.95 <= span <= w * 1.35 else w * 1.12   # head width at the cheeks; hands make it unusable
    return np.array([cx, top, y + h * 1.06, width])


def whole_video_head(path, detectors, step_seconds=0.25):
    """Median head box over the whole video, for a phrase in which the face itself is never detected."""
    cap = cv2.VideoCapture(path)
    step = max(1, int(round(cap.get(cv2.CAP_PROP_FPS) * step_seconds)))
    boxes, index = [], 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if index % step == 0:
            box = head_box(frame, key_green(frame)[1], detectors)
            if box is not None:
                boxes.append(box)
        index += 1
    cap.release()
    if not boxes:
        raise SystemExit("no face found anywhere in the video")
    return np.median(np.array(boxes), axis=0)


def smooth_boxes(boxes):
    """Fills frames without a detection and removes jitter; the size is fixed per clip so the face does not pump."""
    known = [i for i, b in enumerate(boxes) if b is not None]
    if not known:
        raise SystemExit("no face found in the clip")
    filled = np.array([boxes[min(known, key=lambda k: abs(k - i))] for i in range(len(boxes))])
    out = filled.copy()
    for i in range(len(filled)):
        out[i] = np.median(filled[max(0, i - 2): i + 3], axis=0)
    height = np.median(out[:, 2] - out[:, 1])
    width = np.median(out[:, 3])
    centre_y = (out[:, 1] + out[:, 2]) / 2
    return [(cx, cy - height / 2, cy + height / 2, width) for cx, cy in zip(out[:, 0], centre_y)]


def mascot_head(body_path):
    """Silhouette of the mascot's head inside the face box and the Lab colour statistics of its skin."""
    body = np.array(Image.open(body_path).convert("RGBA")).astype(int)
    crop = body[FACE_Y: FACE_Y + FACE_H, FACE_X: FACE_X + FACE_W]
    r, g, b, a = crop[..., 0], crop[..., 1], crop[..., 2], crop[..., 3]
    skin = (a > 0) & (r > g + 15) & (g > b - 5) & (r > 110)
    hair = (a > 0) & (r < 70) & (g < 60)
    mask = (skin | hair).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    (ex, ey), (ew, eh), angle = cv2.fitEllipse(max(contours, key=cv2.contourArea))
    filled = np.zeros_like(mask)
    cv2.ellipse(filled, ((ex, ey), (ew - HEAD_INSET, eh - HEAD_INSET), angle), 1, thickness=-1)
    filled &= (a > 0).astype(np.uint8)                              # stay inside the bottle
    lab = cv2.cvtColor(np.ascontiguousarray(crop[..., :3]).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(float)
    return filled.astype(bool), lab[skin].mean(axis=0), lab[skin].std(axis=0)


def cut_face(frame, box, out_w, out_h):
    """Crops the head box and averages it down to the art grid (alpha-weighted, like the body sprite)."""
    cx, top, chin, width = box
    big_w, big_h = out_w * SUPERSAMPLE, out_h * SUPERSAMPLE
    src = np.float32([[cx - width / 2, top], [cx + width / 2, top], [cx - width / 2, chin]])
    dst = np.float32([[0, 0], [big_w, 0], [0, big_h]])
    warped = cv2.warpAffine(frame, cv2.getAffineTransform(src, dst), (big_w, big_h),
                            flags=cv2.INTER_AREA, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 255, 0))
    rgb, alpha = key_green(warped)
    a4 = alpha.reshape(out_h, SUPERSAMPLE, out_w, SUPERSAMPLE)
    c5 = (rgb * alpha[..., None]).reshape(out_h, SUPERSAMPLE, out_w, SUPERSAMPLE, 3)
    weight = a4.sum(axis=(1, 3))
    colour = c5.sum(axis=(1, 3)) / np.maximum(weight[..., None], 1e-6)
    return colour.clip(0, 255).astype(np.uint8), weight / SUPERSAMPLE ** 2 > 0.5


def match_colours(frames, masks, mean, std):
    """Moves the clip's skin tones toward the mascot face (Reinhard transfer in Lab, partial strength)."""
    labs = [cv2.cvtColor(np.ascontiguousarray(f), cv2.COLOR_RGB2LAB).astype(float) for f in frames]
    samples = np.concatenate([lab[m & (lab[..., 0] > 60)] for lab, m in zip(labs, masks)])
    src_mean, src_std = samples.mean(axis=0), samples.std(axis=0) + 1e-6
    out = []
    for lab in labs:
        moved = (lab - src_mean) / src_std * std + mean
        mixed = lab + (moved - lab) * COLOR_MATCH
        out.append(cv2.cvtColor(mixed.clip(0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB))
    return out


def fit_silhouette(colour, solid, head):
    """Fills the parts of the mascot's head the video face does not cover (no old features peek out)."""
    holes = (head & ~solid).astype(np.uint8)
    if holes.any() and solid.any():
        bgr = cv2.inpaint(colour[..., ::-1].copy(), holes, 3, cv2.INPAINT_TELEA)
        colour = bgr[..., ::-1]
    rgba = np.dstack([colour, np.where(head, 255, 0).astype(np.uint8)])
    return rgba


def write_sheet(frames, path):
    sheet = np.concatenate(frames, axis=1)
    img = Image.fromarray(sheet, "RGBA")
    rgb = img.convert("RGB").quantize(colors=PALETTE_COLORS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    out = rgb.convert("RGBA")
    out.putalpha(img.getchannel("A"))
    out.save(path, optimize=True)


def write_audio(video, start, end, path):
    fade = 0.04
    filters = f"loudnorm=I=-16:TP=-1.5,afade=t=in:d={fade},afade=t=out:st={end - start - fade:.3f}:d={fade}"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{start}", "-to", f"{end}", "-i", video,
                    "-vn", "-ac", "1", "-ar", "48000", "-af", filters, "-c:a", "libopus", "-b:a", "48k", path], check=True)


def build_clip(footage_dir, out_dir, head, mean, std, detectors, clip):
    key, vid, start, end, text = clip
    video = os.path.join(footage_dir, f"TikVideo.App_{vid}-hd.mp4")
    frames = read_frames(video, start, end)
    found = [head_box(f, key_green(f)[1], detectors) for f in frames]
    if all(b is None for b in found):
        found[0] = whole_video_head(video, detectors)    # face turned away in the phrase: use where it sits elsewhere
    boxes = smooth_boxes(found)
    cuts = [cut_face(f, b, FACE_W, FACE_H) for f, b in zip(frames, boxes)]
    colours = match_colours([c for c, _ in cuts], [m for _, m in cuts], mean, std)
    rgba = [fit_silhouette(c, m, head) for c, (_, m) in zip(colours, cuts)]
    write_sheet(rgba, os.path.join(out_dir, f"{key}.png"))
    write_audio(video, start, end, os.path.join(out_dir, f"{key}.ogg"))
    return {"key": key, "text": text, "frames": len(rgba), "duration": round(end - start, 2)}


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    footage_dir, app_dir = sys.argv[1], sys.argv[2]
    out_dir = os.path.join(app_dir, "assets", "phrases")
    os.makedirs(out_dir, exist_ok=True)
    detectors = load_detectors()
    head, mean, std = mascot_head(os.path.join(app_dir, "assets", "sprites", "body.png"))
    table = []
    for clip in CLIPS:
        try:
            table.append(build_clip(footage_dir, out_dir, head, mean, std, detectors, clip))
        except SystemExit as err:            # one bad clip (no face, missing file) must not lose the rest
            print(f"SKIPPED {clip[0]}: {err}", file=sys.stderr)
    for t in table:
        print(f"{t['key']:8s} {t['frames']:3d} frames  {t['text']}")
    module = (
        "// Generated by tools/make_phrases.py: meme phrases with a pixelated talking face. Do not edit by hand.\n"
        f"export const FACE_RECT = {json.dumps({'x': FACE_X, 'y': FACE_Y, 'w': FACE_W, 'h': FACE_H})};  // art pixels on body.png, y down\n"
        f"export const CLIP_FPS = {FPS};\n"
        f"export const PHRASE_CLIPS = {json.dumps(table, ensure_ascii=False, indent=2)};\n"
    )
    with open(os.path.join(app_dir, "src", "phrase-clips.mjs"), "w", encoding="utf-8") as f:
        f.write(module)


if __name__ == "__main__":
    main()
