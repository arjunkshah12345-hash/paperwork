import React from 'react'
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame } from 'remotion'
import { ArrowDownToLine, ArrowRight, Check, Code2, FileImage, FileText, Grid2X2, LayoutGrid, LockKeyhole, Merge, MousePointer2, RotateCw, Search, ShieldCheck, Split, Star, Type, type LucideIcon } from 'lucide-react'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'

const theme = { background: '#fafaf8', paper: '#fffffd', ink: '#292c28', muted: '#72756e', line: '#e2e4db', soft: '#f0f0ea', accent: '#bc4d32', green: '#42664b' }
const ease = Easing.bezier(.16, 1, .3, 1)
const progress = (frame: number, start: number, end: number) => interpolate(frame, [start, end], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease })
const enter = (frame: number, delay = 0) => spring({ frame: frame - delay, fps: 30, config: { damping: 24, stiffness: 150, mass: .9 } })

function Brand({ large = false }: { large?: boolean }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: large ? 22 : 12, fontWeight: 700, letterSpacing: large ? -3 : -1.2, fontSize: large ? 76 : 34 }}><FileText size={large ? 65 : 31} color={theme.accent} strokeWidth={1.6} /><span>paperwork<span style={{ color: theme.accent }}>.</span></span></div>
}

function FilmFrame({ children, chapter, label }: { children: React.ReactNode; chapter: number; label: string }) {
  const frame = useCurrentFrame()
  return <AbsoluteFill style={{ background: theme.background, color: theme.ink, fontFamily: 'DM Sans', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', left: 112, top: 62 }}><Brand /></div>
    <div style={{ position: 'absolute', right: 112, top: 76, display: 'flex', gap: 24, alignItems: 'center', color: theme.muted, fontSize: 19 }}><span>{label}</span><span style={{ width: 42, height: 1, background: theme.line }} /><span>0{chapter} / 06</span></div>
    {children}
    <div style={{ position: 'absolute', left: 112, right: 112, bottom: 48, height: 1, background: theme.line }}><div style={{ width: `${(frame % 180) / 180 * 100}%`, height: 1, background: theme.accent, opacity: .4 }} /></div>
  </AbsoluteFill>
}

function Heading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  const frame = useCurrentFrame()
  return <div style={{ position: 'absolute', left: 210, top: 167, opacity: progress(frame, 0, 14), transform: `translateY(${(1 - enter(frame)) * 28}px)` }}>
    <div style={{ color: theme.accent, fontSize: 17, fontWeight: 600, letterSpacing: 2.8, marginBottom: 15 }}>{eyebrow}</div>
    <h1 style={{ margin: 0, fontSize: 64, fontWeight: 500, letterSpacing: -2.5, lineHeight: 1.15 }}>{title}</h1>
    <p style={{ margin: '16px 0 0', fontSize: 25, color: theme.muted }}>{subtitle}</p>
  </div>
}

function Paper({ page = 1, style, label, image = false }: { page?: number; style?: React.CSSProperties; label?: string; image?: boolean }) {
  return <div style={{ width: 242, height: 310, background: theme.paper, border: `1px solid ${theme.line}`, borderRadius: 7, padding: 29, boxShadow: '0 8px 24px #24261d08', position: 'relative', ...style }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 31 }}><FileText color={theme.accent} size={25} strokeWidth={1.5} /><span style={{ fontSize: 13, color: theme.muted }}>{label || 'PDF'}</span></div>
    <div style={{ background: theme.ink, opacity: .65, width: '65%', height: 9, borderRadius: 2, marginBottom: 20 }} />
    {[.94, .85, 1, .72].map((width, index) => <div key={index} style={{ height: 5, width: `${width * 100}%`, marginBottom: 10, background: theme.line, borderRadius: 2 }} />)}
    {image ? <div style={{ height: 66, marginTop: 21, background: '#dbe1d2', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-evenly', padding: '10px 10px 0' }}>{[20, 30, 24, 42, 36].map((height, index) => <div key={index} style={{ height, width: 17, background: '#89967b' }} />)}</div> : <div style={{ display: 'flex', gap: 8, marginTop: 25 }}>{[.5, .8, .65, 1, .9].map((height, index) => <div key={index} style={{ height: height * 50, width: 23, alignSelf: 'flex-end', background: index === 4 ? '#bc4d3280' : '#d9dece' }} />)}</div>}
    <span style={{ position: 'absolute', bottom: 15, right: 20, color: theme.muted, fontSize: 15 }}>{page.toString().padStart(2, '0')}</span>
  </div>
}

function Pill({ children, Icon = LockKeyhole }: { children: React.ReactNode; Icon?: LucideIcon }) {
  return <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '11px 16px', border: `1px solid ${theme.line}`, borderRadius: 6, color: theme.muted, fontSize: 20, background: theme.paper }}><Icon size={21} strokeWidth={1.6} />{children}</div>
}

function Cursor({ frame, x, y, click = false }: { frame: number; x: number; y: number; click?: boolean }) {
  const pulse = progress(frame, 0, 15)
  return <div style={{ position: 'absolute', left: x, top: y, transform: `scale(${click ? 1 - Math.sin(pulse * Math.PI) * .16 : 1})`, zIndex: 20 }}><MousePointer2 size={42} fill={theme.ink} stroke={theme.paper} strokeWidth={1.5} />{click && <div style={{ position: 'absolute', top: -12, left: -12, width: 50 + pulse * 40, height: 50 + pulse * 40, borderRadius: '50%', border: `2px solid ${theme.accent}`, opacity: 1 - pulse, transform: 'translate(-20%, -20%)' }} />}</div>
}

function AppPanel({ title, children }: { title: string; children: React.ReactNode }) {
  const frame = useCurrentFrame()
  return <div style={{ position: 'absolute', left: 210, top: 368, width: 1500, height: 568, background: theme.paper, border: `1px solid ${theme.line}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 20px 70px #25251b08', transform: `translateY(${(1 - enter(frame, 8)) * 55}px) scale(${.99 + frame * .000055})`, opacity: progress(frame, 5, 25) }}>
    <div style={{ height: 57, borderBottom: `1px solid ${theme.line}`, display: 'flex', alignItems: 'center', padding: '0 26px', gap: 8 }}><span style={{ color: theme.muted, fontSize: 16 }}>Workspace</span><ArrowRight size={14} color={theme.muted} /><span style={{ fontSize: 16 }}>{title}</span><div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>{[0, 1, 2].map(index => <div key={index} style={{ width: 7, height: 7, borderRadius: '50%', background: theme.line }} />)}</div></div>
    <div style={{ position: 'absolute', left: 0, top: 57, bottom: 0, width: 188, borderRight: `1px solid ${theme.line}`, padding: '28px 18px', background: '#f6f6f2' }}>
      {[{ Icon: Grid2X2, name: 'All tools' }, { Icon: FileText, name: 'Recent files' }, { Icon: Star, name: 'Starred tools' }].map(({ Icon, name }, index) => <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 9px', fontSize: 16, marginBottom: 7, background: index === 0 ? theme.soft : undefined, borderRadius: 5, color: index === 0 ? theme.ink : theme.muted }}><Icon size={18} color={index === 0 ? theme.accent : theme.muted} />{name}</div>)}
      <div style={{ position: 'absolute', left: 24, bottom: 26, display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: theme.muted }}><ShieldCheck size={16} />On your device.</div>
    </div>
    <div style={{ position: 'absolute', left: 188, top: 57, right: 0, bottom: 0 }}>{children}</div>
  </div>
}

function Intro() {
  const frame = useCurrentFrame()
  return <FilmFrame chapter={1} label="MEET PAPERWORK">
    <div style={{ position: 'absolute', left: 130, top: 300, transform: `translateY(${(1 - enter(frame)) * 35}px)`, opacity: progress(frame, -12, 10) }}>
      <div style={{ fontSize: 18, color: theme.accent, letterSpacing: 3, fontWeight: 600 }}>THE PRIVATE PDF TOOLKIT</div>
      <h1 style={{ fontSize: 98, lineHeight: 1.08, fontWeight: 500, letterSpacing: -5, margin: '26px 0' }}>PDF tools.<br /><span style={{ color: theme.muted }}>Less friction.</span></h1>
      <p style={{ margin: '28px 0', color: theme.muted, fontSize: 27, opacity: progress(frame, 18, 35) }}>Merge. Organize. Convert. Get on with your day.</p>
      <div style={{ display: 'flex', gap: 13, marginTop: 37, opacity: progress(frame, 32, 48), transform: `translateY(${(1 - enter(frame, 30)) * 20}px)` }}><Pill Icon={Code2}>Free & open source</Pill><Pill>Local-first</Pill></div>
    </div>
    <div style={{ position: 'absolute', left: 1110, top: 300, width: 550, height: 500, transform: `translateY(${-frame * .12}px) scale(${1 + frame * .0003})` }}>
      {[0, 1, 2].map(index => { const reveal = enter(frame, index * 7); return <Paper key={index} page={index + 1} style={{ position: 'absolute', left: 65 + index * 69, top: 100 - index * 32, width: 280, height: 360, transform: `translateY(${(1 - reveal) * 190}px) rotate(${(index - 1) * 11 * reveal}deg)`, opacity: progress(frame, index * 7, index * 7 + 18), zIndex: index }} /> })}
      <div style={{ position: 'absolute', left: 325, top: 390, width: 78, height: 78, borderRadius: 16, background: theme.accent, color: theme.paper, display: 'grid', placeItems: 'center', transform: `scale(${enter(frame, 42)}) rotate(${frame * -.06}deg)` }}><Check size={38} /></div>
    </div>
    <div style={{ position: 'absolute', bottom: 100, left: 130, display: 'flex', gap: 18, alignItems: 'center', fontSize: 18, color: theme.muted, opacity: progress(frame, 50, 70) }}><span>12 everyday tools</span><span style={{ width: 40 + frame * .4, height: 1, background: theme.line }} /><span>One quiet workspace.</span></div>
  </FilmFrame>
}

function MergeScene() {
  const frame = useCurrentFrame()
  const merging = progress(frame, 83, 121)
  const completed = frame >= 122
  return <FilmFrame chapter={2} label="BRING IT TOGETHER">
    <Heading eyebrow="01 — MERGE" title="Two files. One PDF." subtitle="Keep the work together. Leave the busywork behind." />
    <AppPanel title="Merge PDF">
      <div style={{ position: 'absolute', left: 44, top: 35, width: 645 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 27, fontWeight: 500, marginBottom: 12 }}><Merge size={25} color={theme.accent} />Merge PDF</div><p style={{ color: theme.muted, fontSize: 19, margin: '0 0 27px' }}>Combine files in the order you choose.</p>
        {['project-brief.pdf', 'appendix.pdf'].map((name, index) => <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '22px 20px', border: `1px solid ${theme.line}`, borderRadius: 6, marginBottom: 12, background: theme.background, opacity: progress(frame, 20 + index * 12, 37 + index * 12), transform: `translateX(${(1 - enter(frame, 20 + index * 12)) * -40}px)` }}><FileText size={32} color={theme.accent} /><div><div style={{ fontSize: 23 }}>{name}</div><div style={{ fontSize: 15, marginTop: 6, color: theme.muted }}>{index === 0 ? '2 pages' : '3 pages'} · PDF document</div></div><span style={{ marginLeft: 'auto', fontSize: 17, color: theme.muted }}>0{index + 1}</span></div>)}
        <div style={{ marginTop: 24, padding: '18px 20px', background: completed ? theme.green : theme.accent, borderRadius: 6, color: theme.paper, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 21 }}><span>{completed ? 'Download merged.pdf' : frame >= 83 ? 'Combining locally…' : 'Merge PDF'}</span>{completed ? <ArrowDownToLine size={23} /> : <ArrowRight size={23} />}</div>
        <div style={{ marginTop: 13, height: 3, background: theme.soft, opacity: frame >= 83 && !completed ? 1 : 0 }}><div style={{ width: `${merging * 100}%`, height: '100%', background: theme.accent }} /></div>
      </div>
      <div style={{ position: 'absolute', right: 93, top: 39, transform: `translateY(${Math.sin(frame / 45) * 5}px)` }}>
        {[0, 1].map(index => <Paper key={index} page={index + 1} style={{ position: 'absolute', top: 16 - index * merging * 10, left: index * 22 * (1 - merging), opacity: index === 0 ? 1 - merging : 1, transform: `rotate(${(index === 0 ? -7 : 5) * (1 - merging)}deg)`, width: 260, height: 334 }} />)}
        <div style={{ width: 260, height: 334 }} />
        <div style={{ fontSize: 17, color: theme.muted, textAlign: 'center', marginTop: 24, opacity: progress(frame, 122, 136) }}>merged.pdf <span style={{ color: theme.green, marginLeft: 14 }}>5 pages</span></div>
      </div>
      <Cursor frame={frame - 82} x={interpolate(frame, [0, 65, 83, 179], [960, 560, 560, 640], { extrapolateRight: 'clamp', easing: ease })} y={interpolate(frame, [0, 65, 83, 179], [520, 367, 367, 425], { easing: ease })} click={frame >= 82 && frame < 98} />
    </AppPanel>
  </FilmFrame>
}

function OrganizeScene() {
  const frame = useCurrentFrame()
  const moved = progress(frame, 40, 95)
  const rotation = progress(frame, 108, 143)
  return <FilmFrame chapter={3} label="MAKE IT YOURS">
    <Heading eyebrow="02 — ORGANIZE + ROTATE" title="A place for every page." subtitle="Change the order. Find the right angle." />
    <AppPanel title={frame < 105 ? 'Organize PDF' : 'Rotate PDF'}>
      <div style={{ position: 'absolute', left: 45, top: 26, right: 45, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 23 }}>{frame < 105 ? <LayoutGrid size={22} color={theme.accent} /> : <RotateCw size={22} color={theme.accent} />}{frame < 105 ? 'Page order' : 'Rotate selected page'}</div><div style={{ border: `1px solid ${theme.line}`, borderRadius: 5, padding: '12px 22px', fontSize: 20, color: theme.muted, background: theme.background }}>{frame < 105 ? moved < .5 ? '1, 2, 3' : '3, 1, 2' : rotation < .5 ? '0° → 90°' : '90°'}</div></div>
      {[0, 1, 2].map(index => { const target = [1, 2, 0][index]; const position = index + (target - index) * moved; return <div key={index} style={{ position: 'absolute', left: 126 + position * 342, top: 108 - Math.sin(moved * Math.PI) * (index === 2 ? 30 : -6), transform: `scale(${.96 + Math.sin(frame / 80) * .008}) rotate(${index === 2 ? rotation * 90 : 0}deg)`, zIndex: index === 2 ? 4 : 1, opacity: progress(frame, index * 8, index * 8 + 22) }}><Paper page={index + 1} image style={{ border: index === 2 && frame > 38 ? `2px solid ${theme.accent}` : undefined }} /></div> })}
      <div style={{ position: 'absolute', bottom: 20, right: 45, display: 'flex', alignItems: 'center', gap: 10, color: theme.green, fontSize: 18, opacity: progress(frame, 145, 160) }}><Check size={20} />Ready for download</div>
    </AppPanel>
  </FilmFrame>
}

function ConvertScene() {
  const frame = useCurrentFrame()
  const convert = progress(frame, 58, 107)
  return <FilmFrame chapter={4} label="A NEW FORMAT">
    <Heading eyebrow="03 — CONVERT" title="Same work. New possibilities." subtitle="Turn PDF pages into PNGs. Or images into a PDF." />
    <AppPanel title="PDF to images">
      <div style={{ position: 'absolute', left: 69, top: 72, transform: `rotate(${-5 + convert * 5}deg) translateY(${Math.sin(frame / 35) * 4}px)` }}><Paper image page={1} style={{ width: 254, height: 322 }} /><span style={{ display: 'block', textAlign: 'center', color: theme.muted, marginTop: 20, fontSize: 18 }}>project.pdf</span></div>
      <div style={{ position: 'absolute', left: 405, top: 205, display: 'flex', alignItems: 'center', gap: 16 }}><div style={{ width: 75, height: 1, background: theme.line, position: 'relative' }}><div style={{ width: `${convert * 100}%`, height: 2, background: theme.accent }} /></div><ArrowRight size={28} color={theme.accent} /><div style={{ width: 75, height: 1, background: theme.line }} /></div>
      <div style={{ position: 'absolute', right: 60, top: 57, width: 505 }}>
        {[1, 2, 3].map((page, index) => { const reveal = progress(frame, 56 + index * 19, 79 + index * 19); return <div key={page} style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '21px 22px', marginBottom: 12, border: `1px solid ${theme.line}`, borderRadius: 6, background: theme.background, opacity: .24 + reveal * .76, transform: `translateX(${(1 - reveal) * 34}px)` }}><FileImage size={31} color={reveal > .5 ? theme.accent : theme.muted} /><div><div style={{ fontSize: 23 }}>{String(page).padStart(3, '0')}-page-{page}.png</div><div style={{ color: theme.muted, fontSize: 15, marginTop: 5 }}>PNG image</div></div><Check size={22} color={theme.green} style={{ marginLeft: 'auto', opacity: reveal }} /></div> })}
        <div style={{ marginTop: 22, background: theme.accent, borderRadius: 6, color: theme.paper, fontSize: 21, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', opacity: progress(frame, 124, 142), transform: `translateY(${(1 - enter(frame, 124)) * 16}px)` }}><span>Download images.zip</span><ArrowDownToLine size={22} /></div>
      </div>
    </AppPanel>
  </FilmFrame>
}

function PrivacyScene() {
  const frame = useCurrentFrame()
  return <FilmFrame chapter={5} label="PRIVATE BY DESIGN">
    <div style={{ position: 'absolute', left: 210, top: 196, opacity: progress(frame, 0, 15), transform: `translateY(${(1 - enter(frame)) * 25}px)` }}><div style={{ fontSize: 17, color: theme.accent, letterSpacing: 2.8, marginBottom: 18 }}>NOT OUR BUSINESS</div><h1 style={{ margin: 0, fontSize: 68, fontWeight: 500, letterSpacing: -2.5 }}>Your files stay on your device.</h1><div style={{ display: 'flex', gap: 14, marginTop: 24 }}>{['No uploads', 'No accounts', 'No analytics'].map((text, index) => <div key={text} style={{ opacity: progress(frame, 17 + index * 7, 32 + index * 7) }}><Pill Icon={index === 0 ? ShieldCheck : index === 1 ? LockKeyhole : Check}>{text}</Pill></div>)}</div></div>
    <div style={{ position: 'absolute', left: 350, top: 463, width: 1220, height: 405, border: `1px solid ${theme.line}`, background: theme.paper, borderRadius: 12, transform: `scale(${.98 + frame * .00022})`, opacity: progress(frame, 14, 32) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, height: 56, padding: '0 28px', borderBottom: `1px solid ${theme.line}`, color: theme.muted, fontSize: 17 }}><LockKeyhole size={18} />Your browser<span style={{ marginLeft: 'auto', fontSize: 14 }}>LOCAL PROCESSING</span></div>
      <div style={{ position: 'absolute', left: 190, right: 190, top: 205, height: 1, background: theme.line }}><div style={{ height: 3, background: theme.accent, width: `${progress(frame, 32, 101) * 100}%` }} /></div>
      {[{ Icon: FileText, label: 'Your document' }, { Icon: ShieldCheck, label: 'Your workspace' }, { Icon: ArrowDownToLine, label: 'Your download' }].map(({ Icon, label }, index) => <div key={label} style={{ position: 'absolute', left: 120 + index * 400, top: 118, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, width: 180, opacity: progress(frame, 20 + index * 14, 36 + index * 14), transform: `translateY(${Math.sin((frame - index * 12) / 36) * 4}px)` }}><div style={{ width: 120, height: 120, border: `1px solid ${index === 1 ? theme.accent : theme.line}`, borderRadius: 14, background: theme.paper, display: 'grid', placeItems: 'center', color: index === 1 ? theme.accent : theme.ink }}><Icon size={44} strokeWidth={1.4} /></div><span style={{ fontSize: 19, color: theme.muted }}>{label}</span></div>)}
    </div>
    <div style={{ position: 'absolute', left: 350, top: 904, fontSize: 19, color: theme.muted, opacity: progress(frame, 70, 95) }}>Open-source libraries. Bundled locally. Nothing sent away.</div>
  </FilmFrame>
}

function ClosingScene() {
  const frame = useCurrentFrame()
  return <FilmFrame chapter={6} label="READY WHEN YOU ARE">
    <div style={{ position: 'absolute', left: 248, top: 339, width: 400, height: 410, transform: `translateY(${-frame * .5}px) scale(${1 + frame * .00065})` }}>{[0, 1, 2].map(index => <Paper key={index} page={index + 1} style={{ position: 'absolute', left: index * 38, top: index * -18, transform: `rotate(${(index - 1) * 9 * (1 - progress(frame, 15, 100))}deg) translateY(${(1 - enter(frame, index * 5)) * 100}px)`, opacity: progress(frame, index * 5, index * 5 + 20) }} />)}<div style={{ position: 'absolute', left: 250, top: 250, width: 74, height: 74, borderRadius: 14, display: 'grid', placeItems: 'center', background: theme.accent, color: theme.paper, transform: `scale(${enter(frame, 32)})` }}><Check size={34} /></div></div>
    <div style={{ position: 'absolute', left: 835, top: 298, transform: `translateY(${(1 - enter(frame, 7)) * 35}px)`, opacity: progress(frame, 5, 22) }}><Brand large /><h1 style={{ margin: '28px 0', fontSize: 62, fontWeight: 400, letterSpacing: -2.5, lineHeight: 1.15 }}>Your next PDF,<br /><span style={{ color: theme.muted }}>handled.</span></h1><div style={{ display: 'inline-flex', gap: 19, alignItems: 'center', borderBottom: `2px solid ${theme.accent}`, padding: '12px 0 17px', fontSize: 30, marginTop: 7, opacity: progress(frame, 28, 46) }}>paperwork-pdf-emx.pages.dev<ArrowRight size={28} style={{ transform: `translateX(${Math.sin(frame / 15) * 4}px)` }} /></div><div style={{ display: 'flex', alignItems: 'center', gap: 10, color: theme.muted, marginTop: 26, fontSize: 19, opacity: progress(frame, 40, 58) }}><Code2 size={21} />Free. MIT licensed. No sign-up.</div></div>
  </FilmFrame>
}

export function LaunchVideo() {
  return <AbsoluteFill>
    <Audio src={staticFile('paperwork-score.wav')} volume={.78} />
    <Sequence from={0} durationInFrames={120}><Intro /></Sequence>
    <Sequence from={120} durationInFrames={180}><MergeScene /></Sequence>
    <Sequence from={300} durationInFrames={180}><OrganizeScene /></Sequence>
    <Sequence from={480} durationInFrames={180}><ConvertScene /></Sequence>
    <Sequence from={660} durationInFrames={120}><PrivacyScene /></Sequence>
    <Sequence from={780} durationInFrames={120}><ClosingScene /></Sequence>
  </AbsoluteFill>
}
