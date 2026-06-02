import { format } from 'date-fns';
import { getQuickRanges } from '../utils/dashboardDateUtils';

export default function QuickDateSelector({ activeDateRange, onRangeChange }) {
  const ranges = getQuickRanges();

  function isActive(range) {
    return activeDateRange?.from === range.from && activeDateRange?.to === range.to;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500 mr-1 hidden sm:block">Viewing:</span>
      <div className="flex items-center gap-1 flex-wrap">
        {ranges.map(range => (
          <button
            key={range.label}
            onClick={() => onRangeChange(range)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              isActive(range)
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 border border-gray-200'
            }`}
          >
            {range.label}
          </button>
        ))}
      </div>
      {activeDateRange?.from && activeDateRange?.to && (
        <span className="text-xs font-medium text-gray-500 ml-1 hidden md:block">
          {format(new Date(activeDateRange.from + 'T00:00:00'), 'd MMM yyyy')}
          {' – '}
          {format(new Date(activeDateRange.to + 'T00:00:00'), 'd MMM yyyy')}
        </span>
      )}
    </div>
  );
}
