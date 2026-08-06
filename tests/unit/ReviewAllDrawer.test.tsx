/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import ReviewAllDrawer from "@/components/profile/ReviewAllDrawer";
import type { BulletSuggestion } from "@/services/profileBulletAIService";

const rewriteSuggestion: BulletSuggestion = {
  type: "REWRITE",
  bulletId: "b1",
  originalText: "Did some backend work",
  revisedText: "Engineered backend services",
};

const newSuggestion: BulletSuggestion = {
  type: "NEW",
  text: "Led migration to microservices",
};

// The card's Accept button renders a CheckOutlined icon before the "Accept" label, so its
// computed accessible name is "check Accept" — anchored to avoid matching "Accept All"
// (footer, no icon) or "check Accept Merge" (MERGE cards, not used here).
const acceptButton = () =>
  screen.getByRole("button", { name: /^check Accept$/ });

// The footer's own "Close" button (plain text, no icon) vs. the Drawer's built-in icon-only
// close affordance (aria-label "Close", no rendered text node) — disambiguate via text.
const footerCloseButton = () => screen.getByText("Close").closest("button")!;

describe("ReviewAllDrawer (REM-16)", () => {
  it("renders nothing meaningful when closed", () => {
    render(
      <ReviewAllDrawer
        open={false}
        onClose={jest.fn()}
        suggestions={[rewriteSuggestion]}
        onAccept={jest.fn()}
        onSkip={jest.fn()}
        onAcceptAll={jest.fn()}
      />,
    );
    expect(
      screen.queryByText("Review All Suggestions"),
    ).not.toBeInTheDocument();
  });

  it("opens showing the first suggestion card with a 1/N counter", () => {
    render(
      <ReviewAllDrawer
        open={true}
        onClose={jest.fn()}
        suggestions={[rewriteSuggestion, newSuggestion]}
        onAccept={jest.fn()}
        onSkip={jest.fn()}
        onAcceptAll={jest.fn()}
      />,
    );

    expect(
      screen.getByText("Review All Suggestions (1/2)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Did some backend work")).toBeInTheDocument();
    expect(screen.getByText("Engineered backend services")).toBeInTheDocument();
  });

  it("closes via the footer Close button without calling onAccept/onAcceptAll", () => {
    const onClose = jest.fn();
    const onAccept = jest.fn();
    const onAcceptAll = jest.fn();

    render(
      <ReviewAllDrawer
        open={true}
        onClose={onClose}
        suggestions={[rewriteSuggestion]}
        onAccept={onAccept}
        onSkip={jest.fn()}
        onAcceptAll={onAcceptAll}
      />,
    );

    fireEvent.click(footerCloseButton());

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
    expect(onAcceptAll).not.toHaveBeenCalled();
  });

  it("submits Accept for the current card, then advances to the next suggestion", async () => {
    const onAccept = jest.fn().mockResolvedValue(undefined);

    render(
      <ReviewAllDrawer
        open={true}
        onClose={jest.fn()}
        suggestions={[rewriteSuggestion, newSuggestion]}
        onAccept={onAccept}
        onSkip={jest.fn()}
        onAcceptAll={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.click(acceptButton());
    });

    expect(onAccept).toHaveBeenCalledWith(rewriteSuggestion, undefined);
    await waitFor(() =>
      expect(
        screen.getByText("Led migration to microservices"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Review All Suggestions (2/2)"),
    ).toBeInTheDocument();
  });

  it("shows a loading state on the Accept button while onAccept is in flight", async () => {
    let resolveAccept: () => void = () => {};
    const onAccept = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAccept = resolve;
        }),
    );

    render(
      <ReviewAllDrawer
        open={true}
        onClose={jest.fn()}
        suggestions={[rewriteSuggestion]}
        onAccept={onAccept}
        onSkip={jest.fn()}
        onAcceptAll={jest.fn()}
      />,
    );

    const button = acceptButton();
    fireEvent.click(button);

    // Query by test id / DOM position rather than accessible name once loading starts — the
    // "check" icon in the accessible name is swapped for a loading spinner while isBusy is true.
    await waitFor(() => expect(button).toHaveClass("ant-btn-loading"));

    await act(async () => {
      resolveAccept();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByText("All suggestions reviewed.")).toBeInTheDocument(),
    );
  });

  it("stays on the current card and does not advance when onAccept rejects (error state)", async () => {
    const onAccept = jest.fn().mockRejectedValue(new Error("Failed to save"));

    render(
      <ReviewAllDrawer
        open={true}
        onClose={jest.fn()}
        suggestions={[rewriteSuggestion, newSuggestion]}
        onAccept={onAccept}
        onSkip={jest.fn()}
        onAcceptAll={jest.fn()}
      />,
    );

    // handleAccept's own async function has no try/catch around `await onAccept(...)` and is
    // invoked fire-and-forget from the button's onClick (per the "should throw on failure —
    // the card stays put" contract on the prop, the component intentionally lets it propagate
    // for a caller/error-boundary to handle) — so this rejection is unobservable from outside
    // the component and would otherwise surface as an unhandled rejection in this test process.
    // Temporarily detach Jest's own unhandledRejection listener for the duration of the click +
    // settle so it isn't misattributed as a test failure, then restore it.
    const unhandledRejectionListeners = process.listeners("unhandledRejection");
    process.removeAllListeners("unhandledRejection");
    try {
      await act(async () => {
        fireEvent.click(acceptButton());
        await waitFor(() => expect(onAccept).toHaveBeenCalledTimes(1));
        // Let the microtask queue fully settle (handleAccept's finally + rethrow) before
        // restoring the listener.
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    } finally {
      unhandledRejectionListeners.forEach((listener) =>
        process.on(
          "unhandledRejection",
          listener as NodeJS.UnhandledRejectionListener,
        ),
      );
    }

    expect(screen.getByText("Engineered backend services")).toBeInTheDocument();
    expect(
      screen.getByText("Review All Suggestions (1/2)"),
    ).toBeInTheDocument();
  });

  it("submits Accept All via the footer button", async () => {
    const onAcceptAll = jest.fn().mockResolvedValue(undefined);

    render(
      <ReviewAllDrawer
        open={true}
        onClose={jest.fn()}
        suggestions={[rewriteSuggestion, newSuggestion]}
        onAccept={jest.fn()}
        onSkip={jest.fn()}
        onAcceptAll={onAcceptAll}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Accept All" }));
    });

    expect(onAcceptAll).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByText("All suggestions reviewed.")).toBeInTheDocument(),
    );
  });
});
