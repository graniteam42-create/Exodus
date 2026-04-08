import { Grade, scoreToGrade, gradeColor } from '@/lib/types';

interface GradeBadgeProps {
  score: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function GradeBadge({ score, label, size = 'md' }: GradeBadgeProps) {
  const grade = scoreToGrade(score);
  const color = gradeColor(grade);
  const gradeClass = grade.startsWith('A') ? 'grade-a'
    : grade.startsWith('B') ? 'grade-b'
    : grade.startsWith('C') ? 'grade-c'
    : grade.startsWith('D') ? 'grade-d'
    : 'grade-f';

  if (size === 'lg') {
    return (
      <div className={`grade-box ${gradeClass}`}>
        {grade}
        {label && <div className="grade-label">{label}</div>}
      </div>
    );
  }

  if (size === 'sm') {
    return (
      <span className="score-cell" style={{ display: 'inline-block' }}>
        <span className="score-grade" style={{ color }}>{grade}</span>
        <span className="score-num">{score}</span>
      </span>
    );
  }

  return (
    <span className={`grade-inline ${gradeClass}`} title={`${score}/100`}>
      {grade}
    </span>
  );
}
