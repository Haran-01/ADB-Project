import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function DelayChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <BarChart data={data}>
        <CartesianGrid vertical={false} stroke="#23342f" />
        <XAxis dataKey="name" tick={{ fill: '#8da29b', fontSize: 11 }} axisLine={false} />
        <YAxis tick={{ fill: '#8da29b', fontSize: 11 }} axisLine={false} />
        <Tooltip contentStyle={{ background: '#111f1b', border: '1px solid #2a3d36', borderRadius: 8 }} />
        <Bar dataKey="delay" fill="#ffbd5a" radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
