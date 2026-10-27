"""FanDeck motion spot v2: original illustrative sports and original audio."""
from pathlib import Path
import importlib.util, math, subprocess, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('v1', ROOT / 'render-video-ad.py')
v1 = importlib.util.module_from_spec(spec); spec.loader.exec_module(v1)
W, H, FPS, SECONDS = 1080, 1350, 30, 22
LIME, WHITE, MUTED, BG = '#b0ed87', '#f4f5ef', '#98a6b8', '#090f17'
fonts = {}
def font(n, bold=True):
    key = (n, bold)
    if key not in fonts: fonts[key] = ImageFont.truetype('C:/Windows/Fonts/' + ('segoeuib.ttf' if bold else 'segoeui.ttf'), n)
    return fonts[key]
def ease(p):
    p = max(0, min(1, p)); return p*p*(3-2*p)
def mix(a,b,p): return a+(b-a)*p
def blendbox(a,b,p): return tuple(mix(x,y,p) for x,y in zip(a,b))
def txt(im, xy, s, n, color=WHITE, center=False, bold=True):
    d=ImageDraw.Draw(im); f=font(n,bold)
    x,y=xy
    if center: x-=d.textlength(s,font=f)/2
    d.text((round(x),round(y)),s,font=f,fill=color)
def pill(im, box, label, color=LIME, textcolor=BG, size=24):
    d=ImageDraw.Draw(im); d.rounded_rectangle(box,radius=(box[3]-box[1])/2,fill=color)
    txt(im,((box[0]+box[2])/2,box[1]+(box[3]-box[1]-size*1.35)/2),label,size,textcolor,True)
def base(t, beat):
    im=Image.new('RGB',(W,H),BG)
    d=ImageDraw.Draw(im)
    for y in range(H):
        p=max(0,1-abs(y-650)/850)
        d.line((0,y,W,y),fill=(9+int(p*5),15+int(p*8),23+int(p*10)))
    im.paste(v1.icon.resize((48,48)),(52,43),v1.icon.resize((48,48)))
    txt(im,(115,43),'FanDeck',32)
    txt(im,(1027,54),f'0{beat} / 05',18,MUTED,True,False)
    txt(im,(540,1258),'Bring your own streams. No games included.',22,MUTED,True,False)
    txt(im,(540,1298),'Illustrative product demo',16,'#68798b',True,False)
    d.rectangle((0,H-4,W*t/SECONDS,H),fill=LIME)
    return im
def title(im, small, first, second, elapsed):
    offset=round(20*(1-ease(elapsed/.42)))
    txt(im,(56,149+offset),small,19,LIME)
    txt(im,(52,193+offset),first,76)
    txt(im,(52,280+offset),second,76,LIME)
def panel(im, box, color='#192532', outline='#354657', radius=18):
    x,y,w,h=map(round,box); d=ImageDraw.Draw(im)
    d.rounded_rectangle((x+4,y+12,x+w+4,y+h+12),radius=radius,fill='#04090e')
    d.rounded_rectangle((x,y,x+w,y+h),radius=radius,fill=color,outline=outline,width=2)
def sport(im,box,kind,t,i=0):
    x,y,w,h=map(round,box)
    if w<1 or h<1:return
    # Preserve the entire 16:9 picture in every illustrative tile.
    scale=min(w/640,h/360); sw,sh=round(640*scale),round(360*scale)
    ImageDraw.Draw(im).rectangle((x,y,x+w,y+h),fill='#03070a')
    pic=v1.sports(kind,t*1.9,i,show_ball=False).resize((max(1,sw),max(1,sh)),Image.Resampling.BICUBIC)
    im.paste(pic,(x+(w-sw)//2,y+(h-sh)//2))
def webpage(im, box,t,i=0):
    x,y,w,h=map(round,box); panel(im,box,color='#23313e')
    d=ImageDraw.Draw(im)
    for n,c in enumerate(['#e77e78','#d2b86c','#9fc57e']):d.ellipse((x+16+n*18,y+15,x+24+n*18,y+23),fill=c)
    d.rounded_rectangle((x+90,y+10,x+w-54,y+28),radius=6,fill='#344351')
    d.rectangle((x+2,y+42,x+w-2,y+h-3),fill='#cbd3d9')
    d.rectangle((x+18,y+60,x+w-18,y+83),fill='#99a9b5')
    vw=round(w*.69); vh=round(vw*9/16); vx=x+20;vy=y+112
    sport(im,(vx,vy,vw,vh),'hockey',t,i)
    d=ImageDraw.Draw(im)
    for n in range(4):d.rounded_rectangle((vx+vw+17,vy+n*39,x+w-18,vy+n*39+27),radius=4,fill='#a3b2bd')
    for n in range(3):d.rectangle((vx,vy+vh+20+n*18,vx+vw-20,vy+vh+26+n*18),fill='#a0afba')
    return vx,vy,vw,vh
def pointer(im,x,y,phase=0):
    d=ImageDraw.Draw(im)
    if phase>0:
        r=round(15+40*phase);d.ellipse((x-r,y-r,x+r,y+r),outline=LIME,width=3)
    d.polygon([(x,y),(x+2,y+37),(x+12,y+27),(x+24,y+48),(x+34,y+42),(x+23,y+23),(x+40,y+22)],fill=WHITE,outline=BG,width=3)
def deck(im,box,t,layout=4,selected=None):
    x,y,w,h=box; panel(im,(x-3,y-3,w+6,h+6),radius=6)
    if layout==3:
        boxes=[(x,y,w*2/3-1,h),(x+w*2/3,y,w/3,h/2-1),(x+w*2/3,y+h/2,w/3,h/2)]
    else: boxes=[(x+(n%2)*w/2,y+(n//2)*h/2,w/2-1,h/2-1) for n in range(4)]
    for i,b in enumerate(boxes):sport(im,b,['hockey','soccer','basketball','hockey'][i],t,i)
    if selected is not None:
        sx,sy,sw,sh=boxes[selected]
        ImageDraw.Draw(im).rectangle((sx,sy,sx+sw,sy+sh),outline=LIME,width=4)
        # This highlight illustrates which picture the cursor selects, not a product badge.
    return boxes

def frame(t):
    if t<3.2:
        im=base(t,1);title(im,'GAME NIGHT, CURRENTLY','Great games.','Too many tabs.',t)
        for i,(x,y,w,h) in enumerate([(52,440,800,470),(220,610,800,470),(90,780,800,400)]):
            webpage(im,(x+math.sin(t*2+i)*9,y-14*ease(t/.6),w,h),t,i)
    elif t<8:
        u=t-3.2;im=base(t,2);title(im,'THE FANDECK DIFFERENCE','Find the player.','Lose the clutter.',u)
        initial=(52,449,976,669)
        if u<1.3:
            vx,vy,vw,vh=webpage(im,initial,t)
            if u>.4:ImageDraw.Draw(im).rectangle((vx-4,vy-4,vx+vw+4,vy+vh+4),outline=LIME,width=4)
            pointer(im,972,470, max(0,1-abs(u-.55)/.25) if abs(u-.55)<.25 else 0)
        else:
            # Match the source player's exact on-screen rectangle, then grow it into a clean view.
            p=ease((u-1.3)/1.0)
            player=(72,561,673,379); target=(52,490,976,549)
            if p<1:
                layer=im.copy();webpage(layer,initial,t)
                im=Image.blend(layer,im,p)
            rect=blendbox(player,target,p);sport(im,rect,'hockey',t)
            x,y,w,h=rect;ImageDraw.Draw(im).rectangle((x-2,y-2,x+w+2,y+h+2),outline=LIME,width=2)
        txt(im,(540,1157),'Automatic player cropping',32,WHITE,True)
    elif t<12.5:
        u=t-8;im=base(t,3);title(im,'MAKE ROOM FOR GAME NIGHT','Your games.','One screen.',u)
        if u<.65:
            # Split a full-picture view into a 4-up arrangement with visible movement.
            p=ease(u/.65); box=blendbox((52,490,976,549),(52,540,488,274.5),p)
            deck(im,(52,540,976,549),t)
            sport(im,box,'hockey',t)
        else:deck(im,(52,510,976,600),t,3 if u<2.5 else 4)
        pill(im,(344,1150,736,1204),'2 / 3 / 4 / 6 games',color='#22312b',textcolor=LIME,size=25)
    elif t<17:
        u=t-12.5;im=base(t,4);title(im,'FOLLOW THE ACTION','Click a game.','Hear that game.',u)
        selected=0 if u<1.8 else 1
        deck(im,(52,508,976,600),t,selected=selected)
        p=ease((u-.7)/1.1);pointer(im,mix(310,785,p),mix(645,660,p), max(0,1-abs(u-1.8)/.25) if abs(u-1.8)<.25 else 0)
        # Sound visualization outside the illustrative viewer keeps product chrome minimal.
        d=ImageDraw.Draw(im)
        for i in range(13):
            bh=8+abs(math.sin(t*8+i*.9))*30
            x=380+i*9;d.rounded_rectangle((x,1160-bh/2,x+5,1160+bh/2),radius=2,fill=LIME)
        txt(im,(535,1139),'One game at a time.',25,MUTED,bold=False)
    else:
        u=t-17;im=base(t,5)
        size=round(mix(126,144,ease(u/.6)));logo=v1.icon.resize((size,size))
        im.paste(logo,((W-size)//2,264),logo)
        txt(im,(540,458),'FanDeck',100,WHITE,True)
        txt(im,(540,615),'Every game.',78,WHITE,True)
        txt(im,(540,710),'One screen.',78,LIME,True)
        txt(im,(540,855),'Your streams. Just the game.',30,MUTED,True,False)
        pill(im,(242,979,838,1077),'Try the free beta',size=40)
        txt(im,(540,1116),'For desktop Chrome & Edge',24,MUTED,True,False)
    return im

def soundtrack():
    sr=48000;n=sr*SECONDS;audio=np.zeros((n,2),dtype=np.float64);rng=np.random.default_rng(817)
    def add(start,signal,volume=1,pan=0):
        k=round(start*sr);length=min(len(signal),n-k)
        if length>0:
            audio[k:k+length,0]+=signal[:length]*volume*math.sqrt((1-pan)/2)
            audio[k:k+length,1]+=signal[:length]*volume*math.sqrt((1+pan)/2)
    # An original 120 BPM pulse, bass sequence, hats, and transition sweeps.
    for j in range(44):
        start=j*.5;a=np.arange(int(.35*sr))/sr
        add(start,np.sin(2*np.pi*(46*a+3*(1-np.exp(-30*a))))*np.exp(-16*a),.38)
        if j%2:
            a=np.arange(int(.16*sr))/sr;add(start,rng.normal(size=len(a))*np.exp(-35*a),.065)
        for off in [0,.25]:
            a=np.arange(int(.06*sr))/sr;add(start+off,rng.normal(size=len(a))*np.exp(-90*a),.025,(-1 if j%2 else 1)*.5)
        a=np.arange(int(.32*sr))/sr;freq=[110,110,130.81,98][(j//4)%4]
        add(start+.25,(np.sin(2*np.pi*freq*a)+.25*np.sin(4*np.pi*freq*a))*np.exp(-9*a),.09)
    for start in [3.2,4.5,8,10.5,12.5,14.3,17]:
        a=np.arange(int(.38*sr))/sr;noise=rng.normal(size=len(a));smooth=np.convolve(noise,np.ones(8)/8,mode='same')
        add(start-.18,smooth*np.sin(np.pi*a/.38)**2,.11)
        a=np.arange(int(.65*sr))/sr;add(start,np.sin(2*np.pi*660*a)*np.exp(-9*a),.045)
    fade=np.minimum(1,np.arange(n)/sr/.15)*np.minimum(1,(SECONDS-np.arange(n)/sr)/.8)
    audio=np.tanh(audio*1.5)*fade[:,None];path=ROOT/'fandeck-ad-v2-original-audio.wav'
    with wave.open(str(path),'wb') as wav:
        wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(sr);wav.writeframes((audio*30000).astype('<i2').tobytes())
    return path

if __name__=='__main__':
    # Preview every story beat before rendering the full film.
    sheet=Image.new('RGB',(1080,1350),BG)
    for i,t in enumerate([1,3.9,6.4,9.8,11.7,14.8,18,21]):
        thumbnail=frame(t).resize((270,338),Image.Resampling.LANCZOS)
        sheet.paste(thumbnail,((i%4)*270,(i//4)*675+35))
        ImageDraw.Draw(sheet).text(((i%4)*270+12,(i//4)*675+390),f'{t:.1f}s',font=font(20),fill=WHITE)
    sheet.save(ROOT/'fandeck-video-ad-v2-storyboard.jpg',quality=94)
    if '--preview' in __import__('sys').argv:raise SystemExit(0)
    audio=soundtrack();output=ROOT/'fandeck-video-ad-v3.mp4'
    args=[v1.FFMPEG,'-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-i',str(audio),'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-t',str(SECONDS),'-movflags','+faststart',str(output)]
    with (ROOT/'video-render-v2.log').open('w') as log:
        p=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=log,stderr=log)
        try:
            for i in range(FPS*SECONDS):
                p.stdin.write(frame(i/FPS).tobytes())
                if i%90==0:print(f'{i}/{FPS*SECONDS} frames',flush=True)
        finally:p.stdin.close()
        if p.wait():raise RuntimeError('Encoder failed; see video-render-v2.log')
    print(output,flush=True)
