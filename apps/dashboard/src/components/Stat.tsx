import { Stack, Text } from '@atlaskit/primitives';
import { MetricText } from '@atlaskit/primitives/compiled/metric-text';

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card stat-card">
      <Stack space="space.050">
        <Text color="color.text.subtle">
          {label}
        </Text>
        <MetricText size="large">
          {value}
        </MetricText>
        {hint && (
          <Text size="small" color="color.text.subtlest">
            {hint}
          </Text>
        )}
      </Stack>
    </div>
  );
}

