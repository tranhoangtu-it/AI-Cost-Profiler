import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  ChartSkeleton,
  TableSkeleton,
  StatCardSkeleton,
  MetricGridSkeleton,
} from '../dashboard/skeleton-loaders.jsx';

describe('Skeleton Loaders', () => {
  describe('ChartSkeleton', () => {
    it('should render without crashing', () => {
      const { container } = render(<ChartSkeleton />);
      expect(container.firstChild).toBeTruthy();
    });

    it('should have animate-pulse class', () => {
      const { container } = render(<ChartSkeleton />);
      const pulseElements = container.querySelectorAll('.animate-pulse');
      expect(pulseElements.length).toBeGreaterThan(0);
    });

    it('should render skeleton elements', () => {
      const { container } = render(<ChartSkeleton />);
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBe(2); // Title + chart area
    });
  });

  describe('TableSkeleton', () => {
    it('should render without crashing', () => {
      const { container } = render(<TableSkeleton />);
      expect(container.firstChild).toBeTruthy();
    });

    it('should have animate-pulse class', () => {
      const { container } = render(<TableSkeleton />);
      const pulseElements = container.querySelectorAll('.animate-pulse');
      expect(pulseElements.length).toBeGreaterThan(0);
    });

    it('should render default 5 rows plus header', () => {
      const { container } = render(<TableSkeleton />);
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBe(6); // 1 header + 5 rows
    });

    it('should render custom number of rows', () => {
      const { container } = render(<TableSkeleton rows={3} />);
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBe(4); // 1 header + 3 rows
    });

    it('should render 10 rows when specified', () => {
      const { container } = render(<TableSkeleton rows={10} />);
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBe(11); // 1 header + 10 rows
    });

    it('should handle zero rows', () => {
      const { container } = render(<TableSkeleton rows={0} />);
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBe(1); // Just header
    });
  });

  describe('StatCardSkeleton', () => {
    it('should render without crashing', () => {
      const { container } = render(<StatCardSkeleton />);
      expect(container.firstChild).toBeTruthy();
    });

    it('should have animate-pulse class', () => {
      const { container } = render(<StatCardSkeleton />);
      const pulseElements = container.querySelectorAll('.animate-pulse');
      expect(pulseElements.length).toBeGreaterThan(0);
    });

    it('should render card container with proper styling', () => {
      const { container } = render(<StatCardSkeleton />);
      const card = container.querySelector('.rounded-lg');
      expect(card).toBeTruthy();
      expect(card?.classList.contains('border')).toBe(true);
    });

    it('should render title and value skeletons', () => {
      const { container } = render(<StatCardSkeleton />);
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBe(2); // Title + value
    });
  });

  describe('MetricGridSkeleton', () => {
    it('should render without crashing', () => {
      const { container } = render(<MetricGridSkeleton />);
      expect(container.firstChild).toBeTruthy();
    });

    it('should have animate-pulse class', () => {
      const { container } = render(<MetricGridSkeleton />);
      const pulseElements = container.querySelectorAll('.animate-pulse');
      expect(pulseElements.length).toBeGreaterThan(0);
    });

    it('should render 4 stat cards', () => {
      const { container } = render(<MetricGridSkeleton />);
      const cards = container.querySelectorAll('.rounded-lg');
      expect(cards.length).toBe(4);
    });

    it('should render 8 skeleton elements (2 per card x 4 cards)', () => {
      const { container } = render(<MetricGridSkeleton />);
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBe(8);
    });

    it('should have grid layout', () => {
      const { container } = render(<MetricGridSkeleton />);
      const grid = container.querySelector('.grid');
      expect(grid).toBeTruthy();
    });
  });
});
