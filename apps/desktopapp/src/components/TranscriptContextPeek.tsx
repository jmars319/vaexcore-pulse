import { buildCandidateTranscriptContext } from "@vaexcore/pulse-domain";
import { useState } from "react";
import type {
  CandidateWindow,
  TranscriptChunk,
} from "@vaexcore/pulse-shared-types";
import { formatLongTime, percentage } from "../lib/format";

type TranscriptContextPeekProps = {
  candidate: CandidateWindow | null;
  onCorrectTranscriptChunk?: (chunkId: string, text: string) => void;
  transcript: TranscriptChunk[];
};

export function TranscriptContextPeek({
  candidate,
  onCorrectTranscriptChunk,
  transcript,
}: TranscriptContextPeekProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (!candidate) {
    return (
      <section className="context-panel utility-block">
        <div className="section-title-row">
          <div>
            <h3>Transcript context</h3>
            <p className="context-summary-copy">
              Select a moment to see the nearby transcript.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const context = buildCandidateTranscriptContext(transcript, candidate);
  const totalContextChunks =
    context.before.length + context.inside.length + context.after.length;
  const sections: Array<{
    id: "before" | "inside" | "after";
    label: string;
    emptyCopy: string;
    chunks: TranscriptChunk[];
  }> = [
    {
      id: "before",
      label: "Before",
      emptyCopy: "No nearby transcript before this moment.",
      chunks: context.before,
    },
    {
      id: "inside",
      label: "Inside moment",
      emptyCopy: "No transcript saved for this moment.",
      chunks: context.inside,
    },
    {
      id: "after",
      label: "After",
      emptyCopy: "No nearby transcript after this moment.",
      chunks: context.after,
    },
  ];

  return (
    <section className="context-panel utility-block">
      <div className="section-title-row">
        <div>
          <h3>Transcript context</h3>
          <p className="context-summary-copy">
            Nearby transcript text for the selected moment.
          </p>
        </div>
        <span className="queue-count">{totalContextChunks} lines</span>
      </div>

      <div className="context-peek-grid">
        {sections.map((section) => (
          <article
            className={`context-peek-column ${section.id}`}
            key={section.id}
          >
            <div className="context-peek-header">
              <span className="detail-label">{section.label}</span>
              <span className="queue-count">{section.chunks.length}</span>
            </div>

            {section.chunks.length > 0 ? (
              <div className="context-peek-list">
                {section.chunks.map((chunk) => (
                  <article
                    className={`context-chunk ${section.id}`}
                    key={chunk.id}
                  >
                    <div className="context-chunk-top">
                      <span>
                        {formatLongTime(chunk.startSeconds)} to{" "}
                        {formatLongTime(chunk.endSeconds)}
                      </span>
                      {chunk.confidence !== undefined &&
                      chunk.confidence > 0.05 ? (
                        <span>{percentage(chunk.confidence)}</span>
                      ) : null}
                    </div>
                    <p>{chunk.text}</p>
                    {onCorrectTranscriptChunk ? (
                      <div className="transcript-correction-row">
                        <textarea
                          aria-label={`Correct transcript line ${chunk.id}`}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [chunk.id]: event.target.value,
                            }))
                          }
                          value={drafts[chunk.id] ?? chunk.text}
                        />
                        <button
                          className="button-secondary"
                          disabled={
                            (drafts[chunk.id] ?? chunk.text).trim() ===
                              chunk.text.trim() ||
                            !(drafts[chunk.id] ?? chunk.text).trim()
                          }
                          onClick={() =>
                            onCorrectTranscriptChunk(
                              chunk.id,
                              (drafts[chunk.id] ?? chunk.text).trim(),
                            )
                          }
                          type="button"
                        >
                          Save line
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : section.id === "inside" && candidate.transcriptSnippet ? (
              <article className="context-chunk fallback">
                <div className="context-chunk-top">
                  <span>Saved moment snippet</span>
                </div>
                <p>{candidate.transcriptSnippet}</p>
                <small>
                  No transcript line overlaps this moment, so Pulse is showing
                  the snippet saved during the scan instead.
                </small>
              </article>
            ) : (
              <p className="context-empty-copy">{section.emptyCopy}</p>
            )}
          </article>
        ))}
      </div>

      {totalContextChunks === 0 && transcript.length === 0 ? (
        <p className="context-summary-copy">
          No transcript lines were saved for this session. The review uses the
          snippet saved during the scan.
        </p>
      ) : null}
    </section>
  );
}
