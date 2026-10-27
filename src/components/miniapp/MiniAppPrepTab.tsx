import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../../api';
import type { InterviewBank, InterviewQuestion, InterviewCategory } from '../../types';
import { Icon } from '../Icons';
import { tgHaptic } from '../../lib/telegramWebapp';

export function MiniAppPrepTab() {
  const [bank, setBank] = useState<InterviewBank | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<'all' | InterviewCategory>('all');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHints, setShowHints] = useState(false);

  useEffect(() => {
    let mounted = true;
    api.interviewBank
      .get()
      .then((data) => {
        if (mounted) {
          setBank(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const filteredQuestions = useMemo(() => {
    if (!bank || !Array.isArray(bank.questions)) return [];
    if (categoryFilter === 'all') return bank.questions;
    return bank.questions.filter((q) => q.category === categoryFilter);
  }, [bank, categoryFilter]);

  const activeQuestion: InterviewQuestion | undefined = filteredQuestions[currentIndex];

  const handleNext = useCallback(() => {
    tgHaptic.selection();
    setIsFlipped(false);
    setShowHints(false);
    setCurrentIndex((prev) => (prev + 1) % (filteredQuestions.length || 1));
  }, [filteredQuestions.length]);

  const handlePrev = useCallback(() => {
    tgHaptic.selection();
    setIsFlipped(false);
    setShowHints(false);
    setCurrentIndex((prev) => (prev - 1 + filteredQuestions.length) % (filteredQuestions.length || 1));
  }, [filteredQuestions.length]);

  const toggleFlip = useCallback(() => {
    tgHaptic.impact('light');
    setIsFlipped((prev) => !prev);
  }, []);

  const handleTogglePractised = async () => {
    if (!activeQuestion) return;
    tgHaptic.notification('success');
    const nextVal = !activeQuestion.practised;
    // Optimistic update
    setBank((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        questions: prev.questions.map((q) =>
          q.id === activeQuestion.id ? { ...q, practised: nextVal } : q
        ),
      };
    });
    try {
      await api.interviewBank.update(activeQuestion.id, { practised: nextVal });
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-ink-soft">
        <Icon.Refresh className="h-6 w-6 animate-spin mb-2 text-accent" />
        <p className="text-xs">Loading interview question bank…</p>
      </div>
    );
  }

  if (!bank || filteredQuestions.length === 0) {
    return (
      <div className="text-center py-16 px-4 rounded-2xl border border-line bg-panel p-6 shadow-hardXs">
        <div className="text-3xl mb-2">🎙️</div>
        <h3 className="text-sm font-bold text-ink">No Questions Found</h3>
        <p className="text-xs text-ink-soft mt-1">Switch categories or check back later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Category Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'behavioural', label: 'Behavioural' },
            { id: 'servicedesk', label: 'Service Desk' },
            { id: 'police', label: 'NZ Police' },
            { id: 'motivation', label: 'Motivation' },
            { id: 'experience', label: 'Experience' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => {
              tgHaptic.selection();
              setCategoryFilter(item.id);
              setCurrentIndex(0);
              setIsFlipped(false);
              setShowHints(false);
            }}
            className={`px-3 py-1 rounded-full whitespace-nowrap font-medium transition ${
              categoryFilter === item.id
                ? 'bg-accent text-white shadow-hardXs'
                : 'bg-panel-2 text-ink-soft border border-line hover:text-ink'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Progress & Counter Header */}
      <div className="flex items-center justify-between px-1 text-xs text-ink-soft">
        <span className="font-semibold">
          Question {currentIndex + 1} of {filteredQuestions.length}
        </span>
        <button
          onClick={handleTogglePractised}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
            activeQuestion?.practised
              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
              : 'bg-panel-2 text-ink-soft border border-line hover:text-ink'
          }`}
        >
          <span>{activeQuestion?.practised ? '✅ Practiced' : '⚪ Mark Practiced'}</span>
        </button>
      </div>

      {/* Interactive Flashcard */}
      <div
        onClick={toggleFlip}
        className="cursor-pointer perspective rounded-2xl border border-line bg-panel p-5 shadow-hardMd transition hover:border-accent/40 min-h-[260px] flex flex-col justify-between"
      >
        <div>
          {/* Card Top Pill */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-accent/10 text-accent border border-accent/20">
              {activeQuestion?.category || 'Question'}
            </span>
            <span className="text-[11px] text-ink-soft">
              {isFlipped ? 'Tap to view Question' : 'Tap to flip & reveal STAR answer'}
            </span>
          </div>

          {!isFlipped ? (
            /* Front: Question & Hints */
            <div className="space-y-3">
              <h3 className="text-base font-bold text-ink leading-snug">
                "{activeQuestion?.question}"
              </h3>

              {activeQuestion?.hints && activeQuestion.hints.length > 0 && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowHints((prev) => !prev);
                  }}
                  className="mt-4 rounded-xl bg-panel-2 border border-line p-3 text-xs"
                >
                  <div className="flex items-center justify-between text-ink-soft font-semibold">
                    <span className="flex items-center gap-1.5">
                      <span>💡</span>
                      <span>Key Strategy Hints</span>
                    </span>
                    <span>{showHints ? 'Hide' : 'Show'}</span>
                  </div>
                  {showHints && (
                    <ul className="mt-2 space-y-1.5 text-ink-soft list-disc list-inside">
                      {activeQuestion.hints.map((hint, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {hint}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Back: Model STAR Answer */
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-500 uppercase tracking-wide">
                <span>🎯 Candidate STAR Framework Answer:</span>
              </div>
              <p className="text-xs text-ink leading-relaxed whitespace-pre-line bg-panel-2 p-3.5 rounded-xl border border-line">
                {activeQuestion?.answer || 'No model answer provided yet.'}
              </p>
            </div>
          )}
        </div>

        {/* Card Footer Indicator */}
        <div className="mt-4 pt-3 border-t border-line flex items-center justify-between text-[11px] text-ink-soft">
          <span>{isFlipped ? 'Answer View' : 'Question View'}</span>
          <span className="text-accent font-semibold">🔄 Flip Card</span>
        </div>
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handlePrev}
          className="flex-1 py-2.5 rounded-xl border border-line bg-panel text-xs font-bold text-ink hover:bg-panel-2 transition shadow-hardXs active:scale-95"
        >
          &larr; Previous
        </button>
        <button
          onClick={toggleFlip}
          className="py-2.5 px-4 rounded-xl border border-line bg-panel-2 text-xs font-bold text-ink hover:border-accent transition shadow-hardXs active:scale-95"
        >
          {isFlipped ? 'Show Question' : 'Reveal Answer'}
        </button>
        <button
          onClick={handleNext}
          className="flex-1 py-2.5 rounded-xl bg-accent text-white text-xs font-bold shadow-hardXs hover:opacity-90 transition active:scale-95"
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}
