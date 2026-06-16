import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { GameAudio } from "./audio";

type Phase = "setup" | "playing" | "winner";
type Team = "blue" | "red";
type GameMode = "target-score" | "tug-battle";

const REAL_TUG_START_DISTANCE = 3;
const REAL_TUG_WIN_THRESHOLD = REAL_TUG_START_DISTANCE + 1;
const REAL_TUG_VISUAL_STEP = 4.4;
const TARGET_SCORE_VISUAL_STEP = 7.5;

interface SetupState {
  blueTeamName: string;
  redTeamName: string;
  targetScore: number;
  soundEnabled: boolean;
  gameMode: GameMode;
}

interface GameSnapshot extends SetupState {
  phase: Phase;
  words: string[];
  currentWord: string | null;
  usedWordIndexes: number[];
  blueScore: number;
  redScore: number;
  pullBalance: number;
  roundNumber: number;
  lastPointTeam: Team | null;
  winner: Team | null;
}

const DEFAULT_SETUP: SetupState = {
  blueTeamName: "Blue Team",
  redTeamName: "Red Team",
  targetScore: 5,
  soundEnabled: true,
  gameMode: "target-score",
};

const sanitizeWords = (rawText: string) =>
  rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const getNextWord = (words: string[], usedWordIndexes: number[]) => {
  if (words.length === 0) {
    return { currentWord: null, nextIndexes: [] as number[] };
  }

  let pool = usedWordIndexes;
  if (pool.length >= words.length) {
    pool = [];
  }

  const usedSet = new Set(pool);
  const available = words
    .map((_, index) => index)
    .filter((index) => !usedSet.has(index));
  const chosenIndex = available[Math.floor(Math.random() * available.length)];

  return {
    currentWord: words[chosenIndex] ?? null,
    nextIndexes: [...pool, chosenIndex],
  };
};

const audio = new GameAudio();

export default function App() {
  const [setup, setSetup] = useState<SetupState>(DEFAULT_SETUP);
  const [rawWordList, setRawWordList] = useState<string>("");
  const [game, setGame] = useState<GameSnapshot>({
    ...DEFAULT_SETUP,
    phase: "setup",
    words: [],
    currentWord: null,
    usedWordIndexes: [],
    blueScore: 0,
    redScore: 0,
    pullBalance: 0,
    roundNumber: 0,
    lastPointTeam: null,
    winner: null,
  });
  const [wordFileName, setWordFileName] = useState<string>("");
  const [arenaFlash, setArenaFlash] = useState<Team | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showLoserFall, setShowLoserFall] = useState(false);
  const flashTimerRef = useRef<number | null>(null);
  const animationTimerRef = useRef<number | null>(null);

  const words = useMemo(() => sanitizeWords(rawWordList), [rawWordList]);
  const canStart = words.length > 0;
  const blueTeamName = game.blueTeamName;
  const redTeamName = game.redTeamName;

  useEffect(() => {
    audio.setEnabled(setup.soundEnabled);
  }, [setup.soundEnabled]);

  useEffect(() => {
    if (game.phase === "playing") {
      void audio.prime().then(() => {
        audio.startBackground("game");
      });
    } else {
      audio.stopBackground();
    }
  }, [game.phase]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
      if (animationTimerRef.current !== null) {
        window.clearTimeout(animationTimerRef.current);
      }
      audio.stopBackground();
    };
  }, []);

  const queueWordReveal = () => {
    if (!setup.soundEnabled) {
      return;
    }

    void audio.prime().then(() => {
      audio.playReveal();
    });
  };

  const updateSetup = <K extends keyof SetupState>(key: K, value: SetupState[K]) => {
    setSetup((current) => ({ ...current, [key]: value }));
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const nextText = await file.text();
    setRawWordList(nextText);
    setWordFileName(file.name);
    event.target.value = "";
  };

  const handleStartGame = () => {
    if (!canStart) {
      return;
    }

    audio.setEnabled(setup.soundEnabled);
    void audio.prime();
    queueWordReveal();

    const nextWord = getNextWord(words, []);
    setShowLoserFall(false);
    setGame({
      ...setup,
      phase: "playing",
      words,
      currentWord: nextWord.currentWord,
      usedWordIndexes: nextWord.nextIndexes,
      blueScore: 0,
      redScore: 0,
      pullBalance: 0,
      roundNumber: 1,
      lastPointTeam: null,
      winner: null,
    });
  };

  const revealNextWord = (state: GameSnapshot) => {
    const nextWord = getNextWord(state.words, state.usedWordIndexes);
    return {
      currentWord: nextWord.currentWord,
      usedWordIndexes: nextWord.nextIndexes,
      roundNumber: state.roundNumber + 1,
    };
  };

  const animatePoint = (team: Team) => {
    setArenaFlash(team);
    setIsAnimating(true);

    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current);
    }
    if (animationTimerRef.current !== null) {
      window.clearTimeout(animationTimerRef.current);
    }

    flashTimerRef.current = window.setTimeout(() => {
      setArenaFlash(null);
    }, 520);

    animationTimerRef.current = window.setTimeout(() => {
      setIsAnimating(false);
    }, 760);
  };

  const awardPoint = (team: Team) => {
    if (game.phase !== "playing" || game.winner) {
      return;
    }

    void audio.prime();
    audio.playRoundWin(team);
    animatePoint(team);

    setGame((current) => {
      const blueScore = team === "blue" ? current.blueScore + 1 : current.blueScore;
      const redScore = team === "red" ? current.redScore + 1 : current.redScore;
      const nextPullBalance = current.pullBalance + (team === "blue" ? -1 : 1);

      let winner: Team | null = null;
      if (current.gameMode === "target-score") {
        winner = blueScore >= current.targetScore ? "blue" : redScore >= current.targetScore ? "red" : null;
      } else {
        winner =
          nextPullBalance <= -REAL_TUG_WIN_THRESHOLD
            ? "blue"
            : nextPullBalance >= REAL_TUG_WIN_THRESHOLD
              ? "red"
              : null;
      }

      const winningPullLimit = current.gameMode === "tug-battle" ? REAL_TUG_WIN_THRESHOLD : current.targetScore;
      const pullBalance = winner === "blue"
        ? -winningPullLimit
        : winner === "red"
          ? winningPullLimit
          : nextPullBalance;

      if (winner) {
        setShowLoserFall(true);
        if (setup.soundEnabled) {
          void audio.prime().then(() => {
            audio.playVictory(winner);
          });
        }

        return {
          ...current,
          blueScore,
          redScore,
          pullBalance,
          lastPointTeam: team,
          winner,
          phase: "winner",
        };
      }

      const nextRound = revealNextWord(current);
      if (setup.soundEnabled) {
        window.setTimeout(() => {
          queueWordReveal();
        }, 420);
      }

      return {
        ...current,
        blueScore,
        redScore,
        pullBalance,
        lastPointTeam: team,
        ...nextRound,
      };
    });
  };

  const handleSkipWord = () => {
    if (game.phase !== "playing" || game.winner) {
      return;
    }

    void audio.prime();
    queueWordReveal();
    setGame((current) => ({
      ...current,
      ...revealNextWord(current),
    }));
  };

  const resetToSetup = () => {
    setShowLoserFall(false);
    setIsAnimating(false);
    setArenaFlash(null);
    audio.stopBackground();
    setGame((current) => ({
      ...current,
      ...setup,
      phase: "setup",
      words,
      currentWord: null,
      usedWordIndexes: [],
      blueScore: 0,
      redScore: 0,
      pullBalance: 0,
      roundNumber: 0,
      lastPointTeam: null,
      winner: null,
    }));
  };

  const playAgain = () => {
    handleStartGame();
  };

  const winnerName = game.winner === "blue" ? blueTeamName : redTeamName;
  const losingTeam = game.winner === "blue" ? "red" : "blue";
  const ropeShift = game.gameMode === "tug-battle"
    ? game.pullBalance * REAL_TUG_VISUAL_STEP
    : game.pullBalance * TARGET_SCORE_VISUAL_STEP;
  const bluePullProgress = Math.max(0, -game.pullBalance);
  const redPullProgress = Math.max(0, game.pullBalance);
  const modeLabel = game.gameMode === "target-score" ? "Target score mode" : "Real tug mode";
  const modeDescription = game.gameMode === "target-score"
    ? `First team to ${game.targetScore} points wins the match.`
    : "Pull the other team's middle player across the center line to win.";

  return (
    <div className={`app-shell phase-${game.phase}`}>
      <div className="atmosphere atmosphere-left" />
      <div className="atmosphere atmosphere-right" />
      <main className="game-frame">
        <header className="hero-header">
          <p className="eyebrow">Classroom Arcade</p>
          <h1>Word Tug</h1>
          <p className="hero-copy">
            Tug the rope by awarding each round to the team with the best sentence.
          </p>
        </header>

        {game.phase === "setup" && (
          <section className="setup-grid">
            <div className="setup-card">
              <h2>Game Setup</h2>
              <p className="section-copy">
                Build a quick match: set the teams, choose how many points it takes to win, and
                load your word list.
              </p>

              <div className="field-grid">
                <label className="field">
                  <span>Blue team name</span>
                  <input
                    value={setup.blueTeamName}
                    onChange={(event) => updateSetup("blueTeamName", event.target.value)}
                    maxLength={18}
                  />
                </label>
                <label className="field">
                  <span>Red team name</span>
                  <input
                    value={setup.redTeamName}
                    onChange={(event) => updateSetup("redTeamName", event.target.value)}
                    maxLength={18}
                  />
                </label>
              </div>

              <div className="field-grid">
                <label className="field">
                  <span>First to this many points</span>
                  <input
                    type="range"
                    min={3}
                    max={10}
                    value={setup.targetScore}
                    onChange={(event) => updateSetup("targetScore", Number(event.target.value))}
                    disabled={setup.gameMode === "tug-battle"}
                  />
                  <strong>{setup.targetScore} points</strong>
                </label>
                <label className="toggle-field">
                  <span>Sound</span>
                  <button
                    type="button"
                    className={setup.soundEnabled ? "toggle active" : "toggle"}
                    onClick={() => updateSetup("soundEnabled", !setup.soundEnabled)}
                  >
                    {setup.soundEnabled ? "Cute sounds on" : "Muted for now"}
                  </button>
                </label>
              </div>

              <div className="mode-picker">
                <button
                  type="button"
                  className={setup.gameMode === "target-score" ? "mode-option active" : "mode-option"}
                  onClick={() => updateSetup("gameMode", "target-score")}
                >
                  <span>Target score mode</span>
                  <small>Beginner-friendly. First to the chosen score wins.</small>
                </button>
                <button
                  type="button"
                  className={setup.gameMode === "tug-battle" ? "mode-option active" : "mode-option"}
                  onClick={() => updateSetup("gameMode", "tug-battle")}
                >
                  <span>Real tug mode</span>
                  <small>Each team starts 3 pulls from the center line. The 4th pull across wins.</small>
                </button>
              </div>

              <div className="upload-card">
                <div>
                  <h3>Word list</h3>
                  <p>Upload a local `.txt` file with one word per line.</p>
                </div>
                <label className="upload-button">
                  <input type="file" accept=".txt" onChange={handleFileUpload} />
                  Choose file
                </label>
                <div className="upload-meta">
                  <span>{wordFileName || "No file selected yet"}</span>
                  <strong>{words.length} usable words</strong>
                </div>
              </div>

              <label className="field text-area-field">
                <span>Or paste words directly</span>
                <textarea
                  rows={7}
                  placeholder={"apple\njourney\ninvent\ncareful"}
                  value={rawWordList}
                  onChange={(event) => setRawWordList(event.target.value)}
                />
              </label>

              <div className="setup-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    void handleStartGame();
                  }}
                  disabled={!canStart}
                >
                  Start Match
                </button>
                {!canStart && (
                  <p className="helper-text">Add a word list first so the game has questions to show.</p>
                )}
              </div>
            </div>

            <div className="setup-preview">
              <div className="preview-card">
                <p className="preview-label">Primary mode</p>
                <h3>Use this word in a sentence</h3>
                <p>
                  Each round shows a new word. Students compete verbally, and the teacher awards
                  the point to the better answer.
                </p>
              </div>
              <div className="preview-card">
                <p className="preview-label">How it wins</p>
                <h3>{setup.gameMode === "target-score" ? `First to ${setup.targetScore}` : "Pull across the line"}</h3>
                <p>
                  {setup.gameMode === "target-score"
                    ? "Every point tugs the rope harder. The final round snaps the center marker fully across and sends the losing team tumbling."
                    : "The middle player on each side begins 3 pulls away from danger. Pull them across the center line to finish the match."}
                </p>
              </div>
            </div>
          </section>
        )}

        {game.phase !== "setup" && (
          <section className="match-layout">
            <aside className="flank flank-left">
              <TeamPanel
                team="blue"
                name={blueTeamName}
                score={game.blueScore}
                target={game.gameMode === "target-score" ? game.targetScore : REAL_TUG_WIN_THRESHOLD}
                active={arenaFlash === "blue"}
                winner={game.winner === "blue"}
                gameMode={game.gameMode}
                pullProgress={bluePullProgress}
              />
            </aside>

            <div className="match-center">
              <div className="round-chip">
                <span>Round</span>
                <strong>{game.roundNumber}</strong>
              </div>

              <section className="arena-card">
                <div className="arena-header">
                  <div>
                    <p className="preview-label">{modeLabel}</p>
                    <h2>Use this word in a sentence</h2>
                    <p className="mode-copy">{modeDescription}</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => updateSetup("soundEnabled", !setup.soundEnabled)}
                  >
                    {setup.soundEnabled ? "Mute audio" : "Unmute audio"}
                  </button>
                </div>

                <div className={`arena ${isAnimating ? `flash-${arenaFlash}` : ""}`}>
                  <div className="sky-glow" />
                  <div className="ground-strip" />
                  <div className="center-post" />
                  <div
                    className={`rope-scene ${isAnimating ? "is-animating" : ""}`}
                    style={{ transform: `translateX(${ropeShift}%)` }}
                  >
                    <div className="rope-track">
                      <div className="step-markers left" aria-hidden="true">
                        {Array.from({ length: 3 }).map((_, index) => (
                          <span key={`left-step-${index}`} />
                        ))}
                      </div>
                      <div className="center-warning left">
                        3 pulls to the line
                      </div>
                      <div className="rope-flag" />
                      <div className="center-line-glow" />
                      <div className="rope-line">
                        {Array.from({ length: 17 }).map((_, index) => (
                          <span key={index} className={index % 2 === 0 ? "rope-a" : "rope-b"} />
                        ))}
                      </div>
                      <div className="step-markers right" aria-hidden="true">
                        {Array.from({ length: 3 }).map((_, index) => (
                          <span key={`right-step-${index}`} />
                        ))}
                      </div>
                      <div className="center-warning right">
                        3 pulls to the line
                      </div>
                    </div>
                    <TeamGroup
                      team="blue"
                      label={blueTeamName}
                      losing={showLoserFall && losingTeam === "blue"}
                      side="left"
                    />
                    <TeamGroup
                      team="red"
                      label={redTeamName}
                      losing={showLoserFall && losingTeam === "red"}
                      side="right"
                    />
                  </div>
                </div>

                <div className="prompt-card">
                  <p className="preview-label">Current prompt</p>
                  <h3>{game.currentWord}</h3>
                  <p>Students race to say a strong sentence using this word naturally.</p>
                </div>

                {game.phase === "playing" && (
                  <div className="control-row">
                    <button
                      type="button"
                      className="team-button blue"
                      onClick={() => {
                        awardPoint("blue");
                      }}
                    >
                      {blueTeamName} wins the point
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        handleSkipWord();
                      }}
                    >
                      Skip word
                    </button>
                    <button
                      type="button"
                      className="team-button red"
                      onClick={() => {
                        awardPoint("red");
                      }}
                    >
                      {redTeamName} wins the point
                    </button>
                  </div>
                )}

                <div className="footer-actions">
                  <button type="button" className="ghost-button" onClick={resetToSetup}>
                    Back to setup
                  </button>
                </div>
              </section>
            </div>

            <aside className="flank flank-right">
              <TeamPanel
                team="red"
                name={redTeamName}
                score={game.redScore}
                target={game.gameMode === "target-score" ? game.targetScore : REAL_TUG_WIN_THRESHOLD}
                active={arenaFlash === "red"}
                winner={game.winner === "red"}
                gameMode={game.gameMode}
                pullProgress={redPullProgress}
              />
            </aside>
          </section>
        )}

        {game.phase === "winner" && game.winner && (
          <div className="winner-overlay">
            <div className={`winner-card winner-${game.winner}`}>
              <div className="trophy">Trophy</div>
              <p className="preview-label">Champions</p>
              <h2>{winnerName}</h2>
              <p>
                The rope is theirs. The crowd is cheering. Time for another match whenever you are.
              </p>
              <div className="winner-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    void playAgain();
                  }}
                >
                  Play again
                </button>
                <button type="button" className="ghost-button" onClick={resetToSetup}>
                  Change setup
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

interface TeamPanelProps {
  team: Team;
  name: string;
  score: number;
  target: number;
  active: boolean;
  winner: boolean;
  gameMode: GameMode;
  pullProgress: number;
}

function TeamPanel({ team, name, score, target, active, winner, gameMode, pullProgress }: TeamPanelProps) {
  const indicatorTotal = gameMode === "target-score" ? target : REAL_TUG_WIN_THRESHOLD;
  const indicatorFilled = gameMode === "target-score" ? Math.min(score, indicatorTotal) : Math.min(pullProgress, indicatorTotal);

  return (
    <article className={`team-panel ${team} ${active ? "active" : ""} ${winner ? "winner" : ""}`}>
      <p className="preview-label">{team === "blue" ? "Blue side" : "Red side"}</p>
      <h2>{name}</h2>
      <div className="score-dots">
        {Array.from({ length: indicatorTotal }).map((_, index) => (
          <span key={index} className={index < indicatorFilled ? "filled" : ""} />
        ))}
      </div>
      <strong className="score-value">{score}</strong>
      <p className="panel-footnote">
        {gameMode === "target-score" ? `Win at ${target} points` : `${Math.max(0, REAL_TUG_WIN_THRESHOLD - pullProgress)} pulls left to force the line`}
      </p>
    </article>
  );
}

interface TeamGroupProps {
  team: Team;
  label: string;
  losing: boolean;
  side: "left" | "right";
}

function TeamGroup({ team, label, losing, side }: TeamGroupProps) {
  return (
    <div className={`team-group ${team} ${side}`}>
      {Array.from({ length: 3 }).map((_, index) => {
        const role = index === 1 ? "mid" : index === 0 ? "front" : "back";
        return (
          <div
            key={`${team}-${role}`}
            className={`team-figure ${team} ${role} ${losing ? "losing" : ""}`}
          >
            <span className="sr-only">{`${label} ${role} player`}</span>
            <div className="figure-body">
              <div className="figure-hair" />
              <div className="figure-head">
                <div className="face eyes">
                  <span />
                  <span />
                </div>
                <div className="face mouth" />
                <div className="face sweat" />
              </div>
              <div className="figure-torso" />
              <div className="figure-arm arm-front" />
              <div className="figure-arm arm-back" />
              <div className="figure-hand hand-front" />
              <div className="figure-hand hand-back" />
              <div className="figure-leg leg-front" />
              <div className="figure-leg leg-back" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
