import type { Account } from "@/lib/firebase";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

type ProjectionChartProps = {
  chartData: Array<Record<string, string | number>>;
  accounts: Account[];
  formatDate: (dateString: string) => string;
};

const CHART_COLORS = ['#1976d2', '#e53935', '#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#d81b60', '#6d4c41'];

export default function ProjectionChart({
  chartData,
  accounts,
  formatDate,
}: ProjectionChartProps) {
  return (
    <div
      data-testid="chart-container"
      style={{
        height: '30vh',
        backgroundColor: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #eee',
        overflow: 'hidden'
      }}
    >
      <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="fullDate"
                tick={{ fontSize: 10 }}
                interval={Math.floor(chartData.length / 6)}
                tickLine={false}
                tickFormatter={(value: string) => formatDate(value).replace(/, \d{4}$/, '')}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
                width={48}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                formatter={(value: number, name: string) => {
                  const acct = accounts.find(a => a.account_id === name);
                  const label = acct ? `${acct.name} ${acct.mask}` : name;
                  return [new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value), label];
                }}
                labelFormatter={(label: string) => formatDate(label)}
                contentStyle={{ fontSize: '12px', borderRadius: '6px' }}
              />
              <Legend
                formatter={(value: string) => {
                  const acct = accounts.find(a => a.account_id === value);
                  return acct ? `${acct.name} ${acct.mask}` : value;
                }}
                wrapperStyle={{ fontSize: '11px', paddingTop: '0px' }}
              />
              <ReferenceLine
                y={0}
                stroke="#999"
                strokeDasharray="3 3"
                strokeWidth={1}
                ifOverflow="extendDomain"
              />
              {accounts.map((acct, i) => (
                <Line
                  key={acct.account_id}
                  type="stepAfter"
                  dataKey={acct.account_id}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: '14px' }}>
            No account data
          </div>
        )}
      </div>
      {accounts.length > 0 && (
        <div
          data-testid="account-balances"
          style={{
            borderTop: '1px solid #eee',
            padding: '6px 10px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            justifyContent: 'center',
            backgroundColor: '#fafafa'
          }}
        >
          {accounts.map(acct => (
            <div
              key={acct.account_id}
              data-testid={`balance-${acct.mask}`}
              style={{
                fontSize: '12px',
                color: '#333',
                whiteSpace: 'nowrap'
              }}
            >
              <span style={{ color: '#888' }}>{acct.name} {acct.mask}</span>{' '}
              <span style={{ fontWeight: 600 }}>
                {acct.available_balance != null
                  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(acct.available_balance)
                  : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}