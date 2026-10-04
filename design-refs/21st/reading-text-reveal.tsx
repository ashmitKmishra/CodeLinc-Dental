// Source: 21st.dev — Reading Text Reveal (id 9386) by user_2wXKnbD82Toyddx7d1YSlQ8DuJ5
// 
// Retrieved 2026-10-03 for reference. Pure React (no animation library). Adapt: take the text as props instead of the hard-coded story; use Floss tokens.

"use client";

import React, { useRef, useEffect, useState } from 'react';

export const Component = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [revealedWordCount, setRevealedWordCount] = useState(0);

  // Story content
  const storySegments = [
    "So there I was, 3 AM on a Tuesday, debugging code that I swore worked perfectly just six hours ago.",
    "My client had just sent their fourth 'quick question' of the night.",
    "The coffee machine broke at midnight. This was not ideal.",
    "I realized I'd been wearing the same hoodie for three days straight. My cat had stopped judging me. That's when I knew things were serious.",
    "The client wanted 'just a small change' to the entire backend architecture. No big deal, right?",
    "I quoted them two weeks. They needed it by Friday. It was already Wednesday.",
    "My inbox had 47 unread messages. 43 of them started with 'Hey, quick question...'",
    "I discovered I'd been on mute during the entire client call. For 45 minutes, I'd been passionately explaining solutions to absolutely no one.",
    "The 'final' revision was revision number 23. The optimist in me died somewhere around revision 11.",
    "But you know what? I shipped it. On time. It actually worked.",
    "The client loved it. Five stars. Would definitely send more 'quick questions' at 3 AM again.",
    "This is the life. This is freelancing. This is why I'll never go back to a regular job.",
    "At least my cat respects me again."
  ];

  const allWords = storySegments.flatMap(segment => segment.split(' '));
  const totalWords = allWords.length;

  useEffect(() => {
    let rafId: number | null = null;
    let targetProgress = 0;
    let currentProgress = 0;

    const smoothScroll = () => {
      const difference = targetProgress - currentProgress;
      currentProgress += difference * 0.12;
      
      if (Math.abs(targetProgress - currentProgress) > 0.001) {
        const wordsToReveal = Math.floor(currentProgress * totalWords);
        setRevealedWordCount(wordsToReveal);
        rafId = requestAnimationFrame(smoothScroll);
      } else {
        setRevealedWordCount(Math.floor(targetProgress * totalWords));
      }
    };

    const handleScroll = () => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      
      const eyeLevel = windowHeight * 0.62;
      
      const animationStart = rect.top + window.scrollY - eyeLevel;
      const animationEnd = rect.top + window.scrollY + rect.height - eyeLevel;
      const scrollDistance = animationEnd - animationStart;
      const currentScroll = window.scrollY;
      
      let progress = (currentScroll - animationStart) / scrollDistance;
      targetProgress = Math.max(0, Math.min(1, progress));
      
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      
      rafId = requestAnimationFrame(smoothScroll);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [totalWords]);

  let wordIndex = 0;

  return (
    <div className="bg-gradient-to-br from-gray-50 via-gray-100 to-gray-50 dark:from-black dark:via-black dark:to-black transition-colors duration-500">
      {/* Content */}
      <div
        ref={containerRef}
        className="max-w-5xl mx-auto px-8 pt-32 pb-32"
        style={{ minHeight: '400vh' }}
      >
        <div className="space-y-16">
          {storySegments.map((segment, segmentIndex) => {
            const segmentWords = segment.split(' ');
            const segmentStartIndex = wordIndex;
            wordIndex += segmentWords.length;
            
            return (
              <p
                key={segmentIndex}
                className="text-5xl md:text-6xl leading-tight"
                style={{
                  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                  fontWeight: 600
                }}
              >
                {segmentWords.map((word, i) => {
                  const currentWordIndex = segmentStartIndex + i;
                  const isRevealed = currentWordIndex < revealedWordCount;
                  return (
                    <span
                      key={i}
                      className={isRevealed ? 'text-black dark:text-white' : 'text-gray-400 dark:text-gray-600'}
                      style={{
                        transition: 'all 0.3s ease-out',
                        opacity: isRevealed ? 1 : 0.4
                      }}
                    >
                      {word}{' '}
                    </span>
                  );
                })}
              </p>
            );
          })}
        </div>
      </div>
      
      {/* Bottom space */}
      <div style={{ height: '100vh' }} />

      {/* Footer */}
      <div className="pb-20 pt-12 text-center">
        <p 
          className="text-8xl md:text-9xl tracking-tight text-gray-400 dark:text-gray-600"
          style={{ 
            fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            fontWeight: 600
          }}
        >
          The End
        </p>
      </div>
    </div>
  );
};

export default Component;