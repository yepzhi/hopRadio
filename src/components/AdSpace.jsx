import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, Bot, Globe } from 'lucide-react';

const PROMO_SLIDES = [
    {
        lang: "ES",
        flag: "🇲🇽",
        tag: "CURSOS 100% GRATIS CON IA",
        title: "¿Quieres entender la tecnología a tu alrededor?",
        subtitle: "¡Inicia gratis hoy con IA Generativa & STEMBot Socrático! ⚡",
        cta: "Aprender Gratis",
        tagStyle: "bg-red-500/20 text-red-400 border-red-500/30",
        accentGlow: "hover:border-red-500/50 hover:shadow-[0_0_30px_rgba(239,68,68,0.25)]"
    },
    {
        lang: "EN",
        flag: "🇺🇸",
        tag: "100% FREE AI COURSES",
        title: "Want to know about the Tech around you?",
        subtitle: "Start now all free courses powered by GenAI & STEMBot! ⚡",
        cta: "Start Learning Free",
        tagStyle: "bg-blue-500/20 text-blue-400 border-blue-500/30",
        accentGlow: "hover:border-blue-500/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.25)]"
    },
    {
        lang: "ES",
        flag: "🇲🇽",
        tag: "230+ MÓDULOS INTERACTIVOS",
        title: "Domina IA, Semiconductores y Robótica",
        subtitle: "Aprende habilidades del futuro con simulaciones y micro-credenciales 🚀",
        cta: "Explorar Módulos",
        tagStyle: "bg-purple-500/20 text-purple-400 border-purple-500/30",
        accentGlow: "hover:border-purple-500/50 hover:shadow-[0_0_30px_rgba(168,85,247,0.25)]"
    },
    {
        lang: "EN",
        flag: "🇺🇸",
        tag: "NEXT-GEN STEM EDUCATION",
        title: "Empower Your Digital Future",
        subtitle: "Zero cost, unlimited learning. From New York to Mexico & LATAM 🌎",
        cta: "Join JóvenesSTEM",
        tagStyle: "bg-amber-500/20 text-amber-400 border-amber-500/30",
        accentGlow: "hover:border-amber-500/50 hover:shadow-[0_0_30px_rgba(245,158,11,0.25)]"
    }
];

const AdSpace = () => {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isFading, setIsFading] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setIsFading(true);
            setTimeout(() => {
                setCurrentSlide((prev) => (prev + 1) % PROMO_SLIDES.length);
                setIsFading(false);
            }, 350);
        }, 5500);
        return () => clearInterval(interval);
    }, []);

    const slide = PROMO_SLIDES[currentSlide];

    return (
        <div className="w-full max-w-md my-6 px-2 relative z-20">
            <a
                href="https://yepzhi.com/jsweb/"
                target="_blank"
                rel="noopener noreferrer"
                className={`group block relative overflow-hidden rounded-2xl bg-gradient-to-b from-gray-900/90 via-black/90 to-gray-950/90 border border-white/15 p-4 transition-all duration-500 ${slide.accentGlow} backdrop-blur-xl`}
            >
                {/* Background Animated Gradient Mesh */}
                <div className="absolute inset-0 bg-gradient-to-r from-red-600/10 via-purple-600/10 to-amber-600/10 opacity-50 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

                {/* Progress Line */}
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/5 overflow-hidden">
                    <div
                        key={currentSlide}
                        className="h-full bg-gradient-to-r from-red-500 via-purple-500 to-amber-400 animate-pulse"
                        style={{
                            width: '100%',
                            transition: 'width 5.5s linear'
                        }}
                    />
                </div>

                {/* Top Bar: Brand Logo & Slide Indicators */}
                <div className="flex items-center justify-between mb-3 relative z-10">
                    <div className="flex items-center gap-1.5 font-black text-sm tracking-tight">
                        <span className="bg-gradient-to-r from-red-400 via-pink-400 to-amber-300 bg-clip-text text-transparent">
                            jóvenes
                        </span>
                        <span className="text-white">STEM</span>
                        <span className="text-[10px] text-red-400 font-bold bg-red-500/15 border border-red-500/30 px-1.5 py-0.5 rounded-md uppercase tracking-wider ml-1">
                            Web
                        </span>
                    </div>

                    {/* Dots & Flag indicator */}
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-gray-300 bg-white/10 px-1.5 py-0.5 rounded flex items-center gap-1 border border-white/10">
                            <span>{slide.flag}</span>
                            <span className="text-[9px] text-gray-400">{slide.lang}</span>
                        </span>

                        <div className="flex items-center gap-1">
                            {PROMO_SLIDES.map((_, idx) => (
                                <div
                                    key={idx}
                                    className={`h-1.5 rounded-full transition-all duration-500 ${
                                        idx === currentSlide ? 'w-4 bg-red-500' : 'w-1.5 bg-white/20'
                                    }`}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Dynamic Animated Content Body */}
                <div
                    className={`relative z-10 transition-all duration-300 transform ${
                        isFading ? 'opacity-0 translate-y-2 scale-[0.98]' : 'opacity-100 translate-y-0 scale-100'
                    }`}
                >
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] uppercase font-bold tracking-wider mb-2 border backdrop-blur-md shadow-sm ${slide.tagStyle}`}>
                        <Sparkles size={10} className="animate-spin" style={{ animationDuration: '4s' }} />
                        <span>{slide.tag}</span>
                    </div>

                    <h4 className="text-sm md:text-base font-bold text-white tracking-tight mb-1 leading-snug group-hover:text-red-200 transition-colors">
                        {slide.title}
                    </h4>

                    <p className="text-xs text-gray-400 font-normal leading-relaxed mb-3">
                        {slide.subtitle}
                    </p>

                    {/* CTA Button */}
                    <div className="flex items-center justify-between pt-2 border-t border-white/10">
                        <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                            <Bot size={12} className="text-red-400" />
                            <span>AI-Powered Learning</span>
                        </span>

                        <div className="flex items-center gap-1.5 text-xs font-bold text-red-400 group-hover:text-white transition-colors">
                            <span>{slide.cta}</span>
                            <ArrowRight size={14} className="transform group-hover:translate-x-1 transition-transform" />
                        </div>
                    </div>
                </div>
            </a>
        </div>
    );
};

export default AdSpace;
