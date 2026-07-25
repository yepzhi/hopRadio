import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, Bot, Zap } from 'lucide-react';

const PROMO_SLIDES = [
    {
        tag: "100% FREE AI COURSES",
        title: "Want to know about the Tech around you?",
        subtitle: "Start now all free courses powered by GenAI & STEMBot Socrático! ⚡",
        cta: "Start Learning Free",
        tagStyle: "bg-red-500/20 text-red-400 border-red-500/30"
    },
    {
        tag: "230+ INTERACTIVE MODULES",
        title: "Master AI, Semiconductors & Robotics",
        subtitle: "Learn cutting-edge skills with hands-on simulations & micro-credentials 🚀",
        cta: "Explore Free Modules",
        tagStyle: "bg-purple-500/20 text-purple-400 border-purple-500/30"
    },
    {
        tag: "NEXT-GEN STEM EDUCATION",
        title: "Empower Your Digital Future",
        subtitle: "Zero cost, unlimited learning. From New York to Mexico & LATAM 🌎",
        cta: "Join JóvenesSTEM",
        tagStyle: "bg-amber-500/20 text-amber-400 border-amber-500/30"
    }
];

const AdSpace = () => {
    const [currentSlide, setCurrentSlide] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % PROMO_SLIDES.length);
        }, 6000);
        return () => clearInterval(interval);
    }, []);

    const slide = PROMO_SLIDES[currentSlide];

    return (
        <div className="w-full max-w-md my-6 px-2 relative z-20">
            <a
                href="https://yepzhi.com/jsweb/"
                target="_blank"
                rel="noopener noreferrer"
                className="group block relative overflow-hidden rounded-2xl bg-gradient-to-b from-gray-900/90 via-black/90 to-gray-950/90 border border-white/15 p-4 transition-all duration-500 hover:border-red-500/50 hover:shadow-[0_0_30px_rgba(239,68,68,0.25)] backdrop-blur-xl"
            >
                {/* Background Animated Gradient Mesh */}
                <div className="absolute inset-0 bg-gradient-to-r from-red-600/10 via-purple-600/10 to-amber-600/10 opacity-50 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

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

                    {/* Dots indicator */}
                    <div className="flex items-center gap-1">
                        {PROMO_SLIDES.map((_, idx) => (
                            <div
                                key={idx}
                                className={`h-1.5 rounded-full transition-all duration-500 ${
                                    idx === currentSlide ? 'w-5 bg-red-500' : 'w-1.5 bg-white/20'
                                }`}
                            />
                        ))}
                    </div>
                </div>

                {/* Dynamic Content Body */}
                <div className="relative z-10 transition-all duration-500 ease-in-out">
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
                        <span className="text-[10px] text-gray-500 font-medium flex items-center gap-1">
                            <Bot size={12} className="text-red-400" />
                            AI-Powered Learning
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
