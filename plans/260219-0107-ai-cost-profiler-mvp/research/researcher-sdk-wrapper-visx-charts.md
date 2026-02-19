# TypeScript SDK Wrapper & Visx Charts Research

## Topic 1: SDK Wrapper Pattern for LLM Providers

### Wrapper/Proxy Pattern in TypeScript

**Core Design**: Wrap provider SDK clients (OpenAI, Anthropic) to intercept method calls, extract metadata (tokens, latency), emit events.

```typescript
// Wrapper pattern structure
class OpenAIClientWrapper {
  constructor(private openaiClient: OpenAI) {}

  async chat(params: ChatParams): Promise<ChatResponse> {
    const startTime = Date.now();
    const response = await this.openaiClient.chat.completions.create(params);
    const duration = Date.now() - startTime;

    // Extract from response.usage object
    const { prompt_tokens, completion_tokens } = response.usage;

    // Emit event (cost calc, storage)
    await this.emitEvent({
      model: params.model,
      tokens_in: prompt_tokens,
      tokens_out: completion_tokens,
      duration,
      timestamp: Date.now()
    });

    return response;
  }
}
```

**Key Pattern**: Response object contains `usage.prompt_tokens` + `usage.completion_tokens` → no extra API calls needed.

### Token Counting: js-tiktoken

**js-tiktoken**: OpenAI's JavaScript tokenizer. Fast local counting (no network roundtrip).

```typescript
import { encoding_for_model } from 'js-tiktoken';

const enc = encoding_for_model('gpt-4');
const tokens = enc.encode('Hello world');
console.log(tokens.length); // ~2

// For prompt tokenization before sending
const systemPrompt = 'You are helpful...';
const userMsg = 'What is X?';
const totalTokens = enc.encode(systemPrompt + userMsg).length;
```

**Anthropic**: Use official `@anthropic-ai/tokenizer` OR call `/messages/count_tokens` endpoint (more accurate).

```typescript
// Anthropic endpoint approach (batch-safe)
const countTokens = await client.messages.countTokens({
  model: 'claude-3-sonnet-20240229',
  messages: [{ role: 'user', content: 'text' }]
});
// Returns: { input_tokens: N, stop_reason: 'max_tokens' }
```

**Strategy**: Cache tokenizer instances (encoding objects are stateless). Pre-compute prompt template tokens at startup.

### Event Batching Patterns

**Flush on Count OR Timer** (buffering):

```typescript
class EventBatcher {
  private buffer: Event[] = [];
  private readonly BATCH_SIZE = 100;
  private readonly BATCH_INTERVAL_MS = 1000;

  async emit(event: Event) {
    this.buffer.push(event);

    if (this.buffer.length >= this.BATCH_SIZE) {
      await this.flush();
    }
  }

  private startTimer() {
    setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush();
      }
    }, this.BATCH_INTERVAL_MS);
  }

  private async flush() {
    const batch = this.buffer.splice(0);
    await fetch('/api/events/batch', {
      method: 'POST',
      body: JSON.stringify(batch)
    });
  }
}
```

**Benefits**: Reduces request overhead; server handles bulk ingestion efficiently.

---

## Topic 2: Visx + d3-flame-graph for React Dashboards

### Visx Setup in Next.js

Visx = lightweight D3 wrapper (scales, axes, shapes). No bundle bloat.

**Chart Types Available**:
- `@visx/visx-treemap` → Hierarchical cost breakdown (model > feature > user)
- `@visx/visx-sankey` → Flow diagram (tokens/cost from model → feature)
- `@visx/visx-xychart` → Line/bar/scatter (cost trends over time)
- `@visx/visx-axis` + `@visx/visx-scale` → Axes & scales (reusable)

**Next.js Integration** (use client component):

```typescript
'use client';

import { Treemap } from '@visx/visx-treemap';
import { scaleLinear } from '@visx/visx-scale';

export default function CostTreemap({ data }) {
  const color = scaleLinear({
    domain: [0, Math.max(...data.map(d => d.value))],
    range: ['#3b82f6', '#dc2626'] // blue to red
  });

  return (
    <svg width={800} height={600}>
      <Treemap
        root={data} // hierarchical: { name, children: [{name, value}...] }
        size={[800, 600]}
        tile={() => {}} // treemapBinary, treemapSquarify, etc.
      >
        {(tf) => (
          <Group>
            {tf.descendants().map((node, i) => (
              <rect
                key={i}
                x={node.x0}
                y={node.y0}
                width={node.x1 - node.x0}
                height={node.y1 - node.y0}
                fill={color(node.value)}
              />
            ))}
          </Group>
        )}
      </Treemap>
    </svg>
  );
}
```

**Sankey for Cost Flow**:

```typescript
import Sankey from '@visx/visx-sankey';

const links = [
  { source: 0, target: 1, value: 100 }, // 100 tokens from OpenAI → feature_x
  { source: 1, target: 2, value: 50 }   // 50 tokens from feature_x → user_a
];
const nodes = [
  { name: 'openai-gpt4' },
  { name: 'feature_x' },
  { name: 'user_a' }
];

<Sankey
  nodes={nodes}
  links={links}
  nodeWidth={10}
  nodePadding={50}
  margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
  size={[800, 600]}
>
  {(sankey) => (
    <Group>
      {sankey.links.map((link, i) => (
        <path key={i} d={link.path} stroke="rgba(0,0,0,0.2)" strokeWidth={link.width} />
      ))}
      {sankey.nodes.map((node, i) => (
        <circle key={i} cx={node.x} cy={node.y} r={5} fill="#3b82f6" />
      ))}
    </Group>
  )}
</Sankey>
```

### d3-flame-graph Integration

**d3-flame-graph**: Specialized flamegraph renderer (stack visualization).

```typescript
import FlameGraph from 'd3-flame-graph';

// Data format: { name, value, children: [...] }
const data = {
  name: 'total-cost',
  value: 1000,
  children: [
    {
      name: 'feature-search',
      value: 600,
      children: [
        { name: 'gpt-4-call', value: 400 },
        { name: 'embedding', value: 200 }
      ]
    },
    { name: 'feature-chat', value: 400 }
  ]
};

useEffect(() => {
  const svg = d3.select('#flame').append('svg').attr('width', 800).attr('height', 600);
  const flamegraph = new FlameGraph()
    .width(800)
    .height(600)
    .cellHeight(20)
    .transitionDuration(750);

  svg.datum(data).call(flamegraph);
}, [data]);

return <div id="flame" />;
```

**Stack frame = [feature → endpoint → model]**. Width = token cost. Perfect for "which nested calls cost most".

### shadcn/ui Dashboard Layout

Use shadcn/ui primitives + Tailwind grid:

```typescript
export default function DashboardLayout() {
  return (
    <div className="grid grid-cols-3 gap-4 p-6">
      {/* Header with filters */}
      <div className="col-span-3">
        <Card>
          <CardHeader>Cost Overview</CardHeader>
          <CardContent>
            <Select>
              <SelectItem value="model">By Model</SelectItem>
              <SelectItem value="feature">By Feature</SelectItem>
            </Select>
          </CardContent>
        </Card>
      </div>

      {/* Left: Treemap */}
      <div className="col-span-2">
        <Card>
          <CardHeader>Cost Breakdown</CardHeader>
          <CardContent>
            <CostTreemap data={treeData} />
          </CardContent>
        </Card>
      </div>

      {/* Right: Metrics */}
      <div className="col-span-1">
        <Card>
          <CardHeader>Total Cost</CardHeader>
          <CardContent className="text-3xl font-bold">${totalCost}</CardContent>
        </Card>
      </div>

      {/* Bottom: Sankey flow */}
      <div className="col-span-3">
        <Card>
          <CardHeader>Token Flow</CardHeader>
          <CardContent>
            <CostSankey data={sankeyData} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

### SSE in React with TanStack Query

**SSE consumption pattern** (one-way server→client streaming):

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';

export function CostStream() {
  const { data: events } = useQuery({
    queryKey: ['cost-stream'],
    queryFn: async () => {
      const response = await fetch('/api/cost-stream');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const events = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.trim().split('\n');

        lines.forEach(line => {
          if (line.startsWith('data: ')) {
            const event = JSON.parse(line.slice(6));
            events.push(event);
          }
        });
      }
      return events;
    },
    refetchInterval: false, // SSE is push, no polling needed
    staleTime: Infinity
  });

  return (
    <div>
      {events?.map(e => <div key={e.id}>${e.cost}</div>)}
    </div>
  );
}
```

**Better: Use EventSource API**:

```typescript
useEffect(() => {
  const eventSource = new EventSource('/api/cost-stream');

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    setEvents(prev => [...prev, data]);
  };

  eventSource.onerror = () => eventSource.close();

  return () => eventSource.close();
}, []);
```

**Server (Express)**: Flush events every 1-5sec with `res.write('data: ' + JSON.stringify(event) + '\n\n')`.

---

## Key Implementation Decisions

1. **Wrapper over Middleware**: Wrap SDK clients directly (not Express middleware) for language-agnostic SDK.
2. **Token counting**: Use provider-native (tiktoken for OpenAI, Anthropic endpoint). Cache instances.
3. **Event batching**: 100 events OR 1sec timer (balance throughput vs latency).
4. **Visx for complex charts**: Treemap + Sankey combo. Use Recharts for simple bars/lines.
5. **SSE over WebSocket**: Simpler server, sufficient for 1-5sec updates.
6. **Flamegraph data**: Requires trace context (OpenTelemetry trace_id) to correlate parent→child calls.

---

## Unresolved Questions

- How to derive flamegraph stack hierarchy from concurrent async calls (request context correlation)?
- Should cache flamegraph data in Redis or compute on-demand from DB?
- Batch token counting API limit handling for Anthropic (max 1M tokens/batch)?
