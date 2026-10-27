"""Render an original motion-graphics ad. No third-party footage or music."""
from pathlib import Path
import math, struct, subprocess, sys, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / '.video-tools'))
import imageio_ffmpeg
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
W = H = 1080
FPS = 30
DURATION = 20
LIME = '#b0ed87'
WHITE = '#f3f1eb'
MUTED = '#a7b5c9'
FONT = Path('C:/Windows/Fonts')
def font(size, bold=False): return ImageFont.truetype(str(FONT / ('segoeuib.ttf' if bold else 'segoeui.ttf')), size)
F = {size: font(size, size >= 30) for size in [15, 18, 20, 22, 26, 32, 40, 48, 62, 68, 76, 82]}
icon = Image.open(ROOT.parent / 'extension/icons/fandeck-128.png').convert('RGBA')
yy, xx = np.mgrid[0:H, 0:W]
glow = np.maximum(0, 1 - np.sqrt(((xx - 700) / 1100)**2 + ((yy - 550) / 1000)**2))
background = np.zeros((H, W, 3), dtype=np.uint8)
for c, base in enumerate([8, 14, 22]): background[:, :, c] = base + (glow * [8, 12, 15][c]).astype(np.uint8)
BG = Image.fromarray(background)
def ease(x): x=max(0,min(1,x)); return 1-(1-x)**3
def lerp(a,b,t): return a+(b-a)*t
def text(draw, xy, value, size, fill=WHITE, center=False):
    if center: xy=(xy[0]-draw.textlength(value, font=F[size])/2,xy[1])
    draw.text(xy,value,font=F[size],fill=fill)
def badge(draw, xy, value):
    x,y=xy; width=draw.textlength(value,font=F[18])+28
    draw.rounded_rectangle((x,y,x+width,y+34),radius=8,fill='#172332')
    text(draw,(x+14,y+5),value,18,LIME)

def court(kind):
    im=Image.new('RGB',(640,360),'#e5edf0'); d=ImageDraw.Draw(im)
    if kind == 'soccer':
        for x in range(0,640,64): d.rectangle((x,0,x+64,360),fill='#275b3c' if x%128 else '#306a44')
        d.rectangle((26,24,614,336),outline='#b7d9b6',width=2); d.line((320,24,320,336),fill='#b7d9b6',width=2)
        d.ellipse((262,122,378,238),outline='#b7d9b6',width=2)
        for x in [26,534]: d.rectangle((x,93,x+80,267),outline='#b7d9b6',width=2)
    elif kind == 'basketball':
        for x in range(0,640,32): d.rectangle((x,0,x+32,360),fill='#bc905b' if x%64 else '#c69a64')
        d.rectangle((24,24,616,336),outline='#f1d6ae',width=3); d.line((320,24,320,336),fill='#f1d6ae',width=2)
        d.ellipse((274,134,366,226),outline='#f1d6ae',width=2)
        for x in [24,530]: d.rectangle((x,118,x+86,242),outline='#f1d6ae',width=2)
        for x in [56,584]: d.ellipse((x-7,173,x+7,187),outline='#b94524',width=3)
    else:
        d.rounded_rectangle((16,18,624,342),radius=72,fill='#e7eff2',outline='#719eb3',width=5)
        for x in [218,422]: d.line((x,25,x,335),fill='#2a739d',width=4)
        d.line((320,22,320,338),fill='#bc4553',width=3); d.ellipse((262,122,378,238),outline='#bc4553',width=2)
        for x in [160,480]:
            for y in [104,256]: d.ellipse((x-35,y-35,x+35,y+35),outline='#c88488',width=2)
        for x in [45,577]: d.rectangle((x,155,x+18,205),outline='#bf4553',width=3)
    return im
COURTS = {k:court(k) for k in ['hockey','soccer','basketball']}
def sports(kind,t,index=0,show_ball=True):
    im=COURTS[kind].copy(); d=ImageDraw.Draw(im)
    for team in range(2):
        for n in range(5):
            a=t*(.4+n*.03)+n*1.1+index
            x=90+n*90+math.sin(a)*43 + team*20
            y=115+team*105+math.cos(a*1.2)*44
            d.ellipse((x-10,y-7,x+12,y+14),fill='#00000035')
            d.ellipse((x-8,y-8,x+8,y+8),fill='#17466c' if team==0 else '#df7b37',outline='#edf4ee',width=2)
            if kind=='hockey': d.line((x+5,y+4,x+20,y+14),fill='#475866',width=2)
    x=320+math.sin(t*1.4+index)*210; y=180+math.sin(t*2)*75
    if show_ball:
        d.ellipse((x-4,y-4,x+4,y+4),fill='#eef3dc' if kind=='soccer' else '#291f20',outline='#152332')
    d.rounded_rectangle((25,25,210,57),radius=5,fill='#101620')
    d.text((36,31),'HOME  2     AWAY  1',font=font(15,True),fill=WHITE)
    return im
def paste_video(im,box,kind,t,index=0):
    x,y,w,h=map(round,box)
    video=sports(kind,t,index).resize((max(1,w),max(1,h)),Image.Resampling.LANCZOS)
    im.paste(video,(x,y))
def browser(im,box,t,index=0,clean=False):
    x,y,w,h=map(round,box)
    d=ImageDraw.Draw(im)
    d.rounded_rectangle((x+6,y+12,x+w+6,y+h+12),radius=12,fill='#04070c')
    d.rounded_rectangle((x,y,x+w,y+h),radius=12,fill='#162130',outline='#49586b',width=2)
    for i,color in enumerate(['#f07874','#e5bd65','#92cb86']): d.ellipse((x+14+i*15,y+12,x+22+i*15,y+20),fill=color)
    d.rounded_rectangle((x+80,y+8,x+w-60,y+24),radius=4,fill='#243142')
    im.alpha_composite(icon.resize((25,25)),(x+w-38,y+4))
    if not clean:
        d.rectangle((x+2,y+34,x+w-2,y+h-2),fill='#d9e0e5')
        d.rectangle((x+18,y+49,x+w-18,y+72),fill='#aebbc7')
        vw=w*.65; vh=vw*9/16; vx=x+22; vy=y+88
        paste_video(im,(vx,vy,vw,vh),'hockey',t,index)
        d=ImageDraw.Draw(im)
        for n in range(4): d.rounded_rectangle((x+w*.73,y+89+n*34,x+w-18,y+111+n*34),radius=3,fill='#b8c3cf')
        for n in range(3): d.rectangle((x+22,vy+vh+18+n*15,x+w*.68,vy+vh+24+n*15),fill='#b7c2cd')
        return (vx,vy,vw,vh)
def cursor(im,x,y,click=False):
    d=ImageDraw.Draw(im)
    if click: d.ellipse((x-28,y-28,x+28,y+28),outline=LIME,width=3)
    d.polygon([(x,y),(x+3,y+35),(x+12,y+25),(x+23,y+44),(x+32,y+39),(x+21,y+21),(x+36,y+20)],fill=WHITE,outline='#101620',width=2)
def heading(im,line1,line2):
    d=ImageDraw.Draw(im); text(d,(64,136),line1,68); text(d,(64,215),line2,68,LIME)
def base(t):
    im=BG.copy().convert('RGBA'); d=ImageDraw.Draw(im)
    im.alpha_composite(icon.resize((45,45)),(58,42)); text(d,(116,41),'FanDeck',32)
    text(d,(1016,53),'FREE BETA',18,LIME,False) if False else None
    d.rounded_rectangle((866,43,1017,80),radius=18,fill='#1d3024',outline='#426b3a')
    text(d,(942,49),'FREE BETA',18,LIME,True)
    text(d,(540,1004),'Bring your own streams. No games included.',20,MUTED,True)
    text(d,(540,1037),'Illustrative demo',15,'#62758b',True)
    d.rectangle((0,H-4,int(W*t/DURATION),H),fill=LIME)
    return im

def frame(t):
    im=base(t); d=ImageDraw.Draw(im)
    if t < 3:
        heading(im,'Too many games.','Too many tabs.')
        for n,(x,y,w,h) in enumerate([(65,377,650,410),(355,493,650,410),(168,590,650,365)]):
            shift=math.sin(t*1.7+n)*6
            browser(im,(x+shift,y,w,h),t,n)
    elif t < 6:
        heading(im,'Meet FanDeck.','Keep just the game.')
        selected=browser(im,(66,365,948,575),t)
        d=ImageDraw.Draw(im)
        progress=ease((t-3.5)/.65)
        vx,vy,vw,vh=selected
        if progress>0: d.rounded_rectangle((vx-5,vy-5,vx+vw+5,vy+vh+5),radius=6,outline=LIME,width=max(1,round(4*progress)))
        if t>4.6:
            d.rounded_rectangle((95,885,563,922),radius=9,fill='#172d22')
            text(d,(113,891),'Player found automatically',20,LIME)
        p=ease((t-3)/1.2); cursor(im,lerp(690,987,p),lerp(780,384,p),4.05<t<4.35)
    elif t < 12:
        heading(im,'Just the games.','All together.')
        x,y,w,h=64,360,952,536
        if t<6.8:
            p=ease((t-6)/.8); w=int(lerp(840,952,p)); x=(W-w)//2; h=int(w*9/16)
        d=ImageDraw.Draw(im); d.rounded_rectangle((x-3,y-3,x+w+3,y+h+3),radius=9,fill='#425369')
        for n,kind in enumerate(['hockey','soccer','basketball','hockey']):
            paste_video(im,(x+(n%2)*(w/2),y+(n//2)*(h/2),w/2-1,h/2-1),kind,t,n)
        text(ImageDraw.Draw(im),(540,931),'Automatically removes the surrounding webpage.',22,MUTED,True)
    elif t < 16:
        heading(im,'Click a game.','Switch the sound.')
        x,y,w,h=64,360,952,536
        selected=0 if t<13.5 else 1
        for n,kind in enumerate(['hockey','soccer','basketball','hockey']):
            paste_video(im,(x+(n%2)*w/2,y+(n//2)*h/2,w/2-1,h/2-1),kind,t,n)
        p=ease((t-12.5)/1.0); cursor(im,lerp(300,780,p),lerp(500,505,p),13.35<t<13.65)
        d=ImageDraw.Draw(im); d.rounded_rectangle((350,921,730,968),radius=12,fill='#182331',outline='#425369')
        text(d,(540,931),f'Sound   ·   Game {selected+1}',22,LIME,True)
    else:
        p=ease((t-16)/.7)
        im.alpha_composite(icon.resize((150,150)),(465,round(lerp(285,265,p))))
        d=ImageDraw.Draw(im); text(d,(540,437),'FanDeck',82,WHITE,True)
        text(d,(540,558),'Every game. One screen.',48,LIME,True)
        text(d,(540,641),'Your streams. Just the game.',26,MUTED,True)
        d.rounded_rectangle((256,757,824,844),radius=43,fill=LIME)
        text(d,(540,774),'Try the free beta',40,'#101b12',True)
    return im.convert('RGB')

def soundtrack():
    rate=48000; t=np.arange(int(rate*DURATION))/rate; out=np.zeros_like(t)
    # Original understated electronic pulse; no sampled commercial recordings.
    beat=60/108
    for i in range(int(DURATION/beat)):
        start=i*beat; a=np.maximum(t-start,0); active=(t>=start)&(a<.3)
        out+=active*.19*np.sin(2*np.pi*(58*a+5*(1-np.exp(-22*a))))*np.exp(-18*a)
        if i%2:
            rng=np.random.default_rng(100+i); out+=active*.025*rng.standard_normal(len(t))*np.exp(-45*a)
    for start,note in [(3,220),(6,277.18),(12,329.63),(16,440)]:
        a=np.maximum(t-start,0); active=(t>=start)&(a<1.5)
        out+=active*.035*(np.sin(2*np.pi*note*a)+.35*np.sin(2*np.pi*note*2*a))*np.exp(-2.4*a)
    fade=np.minimum(1,t/.4)*np.minimum(1,(DURATION-t)/.8)
    pcm=(np.clip(out*fade,-1,1)*32767).astype('<i2')
    audio=ROOT/'fandeck-ad-original-audio.wav'
    with wave.open(str(audio),'wb') as wav: wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(rate); wav.writeframes(pcm.tobytes())
    return audio

if __name__=='__main__':
    audio=soundtrack(); output=ROOT/'fandeck-video-ad-v1.mp4'
    args=[FFMPEG,'-y','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-i',str(audio),'-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-t',str(DURATION),'-movflags','+faststart',str(output)]
    with (ROOT/'video-render.log').open('w') as log:
        process=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=log,stderr=log)
        try:
            for i in range(FPS*DURATION):
                process.stdin.write(frame(i/FPS).tobytes())
                if i%90==0: print(f'Rendered {i}/{FPS*DURATION} frames',flush=True)
        finally: process.stdin.close()
        if process.wait()!=0: raise RuntimeError('Video encoder failed. See video-render.log.')
    # A contact sheet allows inspection of each beat without claiming live UI footage.
    sheet=Image.new('RGB',(1080,720),'#101620')
    for i,time in enumerate([1,4.8,8,13.8,16.8,19]): sheet.paste(frame(time).resize((360,360),Image.Resampling.LANCZOS),((i%3)*360,(i//3)*360))
    sheet.save(ROOT/'fandeck-video-ad-contact-sheet.jpg',quality=92)
    print(f'Saved {output}',flush=True)
