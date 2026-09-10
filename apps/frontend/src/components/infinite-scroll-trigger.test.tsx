import { fireEvent, render, screen } from "@testing-library/react";
import { useLayoutEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InfiniteScrollTrigger } from "./infinite-scroll-trigger";

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

interface ObserverInstance {
  callback: ObserverCallback;
  options: IntersectionObserverInit | undefined;
  observed: Element[];
  disconnected: boolean;
}

let instances: ObserverInstance[] = [];

class MockIntersectionObserver {
  instance: ObserverInstance;

  constructor(callback: ObserverCallback, options?: IntersectionObserverInit) {
    this.instance = { callback, options, observed: [], disconnected: false };
    instances.push(this.instance);
  }

  observe = (element: Element) => {
    this.instance.observed.push(element);
  };

  disconnect = () => {
    this.instance.disconnected = true;
  };
}

function lastInstance(): ObserverInstance {
  const instance = instances[instances.length - 1];
  if (!instance) throw new Error("no IntersectionObserver was created");
  return instance;
}

function BackgroundRefetchHarness({ onLoadMore }: { onLoadMore: () => void }) {
  const [isFetching, setIsFetching] = useState(false);

  useLayoutEffect(() => {
    if (isFetching) {
      lastInstance().callback([{ isIntersecting: true }]);
    }
  }, [isFetching]);

  return (
    <>
      <button type="button" onClick={() => setIsFetching(true)}>
        Start background refetch
      </button>
      <InfiniteScrollTrigger
        onLoadMore={onLoadMore}
        hasNextPage={true}
        isFetching={isFetching}
        isFetchingNextPage={false}
        hasLoadMoreError={false}
      />
    </>
  );
}

describe("InfiniteScrollTrigger", () => {
  beforeEach(() => {
    instances = [];
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a sentinel and observes it while more pages exist", () => {
    render(
      <InfiniteScrollTrigger
        onLoadMore={vi.fn()}
        hasNextPage={true}
        isFetching={false}
        isFetchingNextPage={false}
        hasLoadMoreError={false}
      />,
    );

    expect(instances).toHaveLength(1);
    expect(lastInstance().observed).toHaveLength(1);
  });

  it("renders nothing when pagination is finished", () => {
    const { container } = render(
      <InfiniteScrollTrigger
        onLoadMore={vi.fn()}
        hasNextPage={false}
        isFetching={false}
        isFetchingNextPage={false}
        hasLoadMoreError={false}
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(instances).toHaveLength(0);
  });

  it("calls onLoadMore when the sentinel intersects", () => {
    const onLoadMore = vi.fn();
    render(
      <InfiniteScrollTrigger
        onLoadMore={onLoadMore}
        hasNextPage={true}
        isFetching={false}
        isFetchingNextPage={false}
        hasLoadMoreError={false}
      />,
    );

    lastInstance().callback([{ isIntersecting: true }]);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("shows the loading indicator while the next page is fetching", () => {
    render(
      <InfiniteScrollTrigger
        onLoadMore={vi.fn()}
        hasNextPage={true}
        isFetching={true}
        isFetchingNextPage={true}
        hasLoadMoreError={false}
      />,
    );

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("keeps a status live region mounted before any fetch starts", () => {
    render(
      <InfiniteScrollTrigger
        onLoadMore={vi.fn()}
        hasNextPage={true}
        isFetching={false}
        isFetchingNextPage={false}
        hasLoadMoreError={false}
      />,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("offers an accessible Load more button that fetches on activation", () => {
    const onLoadMore = vi.fn();
    render(
      <InfiniteScrollTrigger
        onLoadMore={onLoadMore}
        hasNextPage={true}
        isFetching={false}
        isFetchingNextPage={false}
        hasLoadMoreError={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("disables the Load more button while a fetch is in flight", () => {
    const onLoadMore = vi.fn();
    render(
      <InfiniteScrollTrigger
        onLoadMore={onLoadMore}
        hasNextPage={true}
        isFetching={true}
        isFetchingNextPage={true}
        hasLoadMoreError={false}
      />,
    );

    const button = screen.getByRole("button", { name: /load more/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("does not fetch the next page while a background refetch is in flight", () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(
      <InfiniteScrollTrigger
        onLoadMore={onLoadMore}
        hasNextPage={true}
        isFetching={false}
        isFetchingNextPage={false}
        hasLoadMoreError={false}
      />,
    );
    const observerCallback = lastInstance().callback;

    // A background refetch starts: isFetching without isFetchingNextPage.
    rerender(
      <InfiniteScrollTrigger
        onLoadMore={onLoadMore}
        hasNextPage={true}
        isFetching={true}
        isFetchingNextPage={false}
        hasLoadMoreError={false}
      />,
    );

    // An entry delivered from the observer created before the rerender
    // must see the latest state and refuse to overlap the refetch.
    observerCallback([{ isIntersecting: true }]);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("uses the current fetch guard before passive effects run", () => {
    const onLoadMore = vi.fn();
    render(<BackgroundRefetchHarness onLoadMore={onLoadMore} />);

    fireEvent.click(screen.getByRole("button", { name: "Start background refetch" }));

    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("stops automatic loading after a next-page error and offers a manual retry", () => {
    const onLoadMore = vi.fn();
    render(
      <InfiniteScrollTrigger
        onLoadMore={onLoadMore}
        hasNextPage={true}
        isFetching={false}
        isFetchingNextPage={false}
        hasLoadMoreError={true}
      />,
    );

    expect(instances).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("Error");

    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).not.toHaveClass("sr-only");
    fireEvent.click(retryButton);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("reconnects the observer when the trigger moves to a different layout slot", () => {
    const props = {
      onLoadMore: vi.fn(),
      hasNextPage: true,
      isFetching: false,
      isFetchingNextPage: false,
      hasLoadMoreError: false,
    };
    const { rerender } = render(
      <div data-testid="desktop">
        <InfiniteScrollTrigger {...props} />
      </div>,
    );
    expect(instances).toHaveLength(1);

    rerender(
      <section data-testid="mobile">
        <InfiniteScrollTrigger {...props} />
      </section>,
    );

    expect(instances.length).toBeGreaterThan(1);
    expect(instances[0].disconnected).toBe(true);
    const active = lastInstance();
    expect(active.disconnected).toBe(false);
    expect(active.observed).toHaveLength(1);
  });
});
