import { describe, it, expect } from "vitest";
import { findJoinUrl } from "../join-url";

describe("findJoinUrl", () => {
  it("finds a Google Meet link in the location", () => {
    expect(findJoinUrl(["https://meet.google.com/abc-defg-hij"])).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("finds a Teams link wrapped in angle brackets in the notes", () => {
    const notes =
      "Microsoft Teams meeting\nJoin: <https://teams.microsoft.com/l/meetup-join/19%3ameeting_XYZ%40thread.v2/0?context=%7b%22Tid%22%7d>\nMeeting ID: 123";
    expect(findJoinUrl([undefined, notes])).toBe(
      "https://teams.microsoft.com/l/meetup-join/19%3ameeting_XYZ%40thread.v2/0?context=%7b%22Tid%22%7d",
    );
  });

  it("finds the newer teams.microsoft.com/meet format and teams.live.com", () => {
    expect(findJoinUrl(["https://teams.microsoft.com/meet/2345678901?p=abc"])).toBe(
      "https://teams.microsoft.com/meet/2345678901?p=abc",
    );
    expect(findJoinUrl(["https://teams.live.com/meet/9312345"])).toBe("https://teams.live.com/meet/9312345");
  });

  it("finds a Zoom link on a company subdomain", () => {
    expect(findJoinUrl(["Join https://acme.zoom.us/j/9876543210?pwd=xyz."])).toBe(
      "https://acme.zoom.us/j/9876543210?pwd=xyz",
    );
  });

  it("prefers the first text that has a link", () => {
    expect(
      findJoinUrl(["https://meet.google.com/aaa-bbbb-ccc", "https://teams.microsoft.com/l/meetup-join/x"]),
    ).toBe("https://meet.google.com/aaa-bbbb-ccc");
  });

  it("ignores links that are not meetings", () => {
    expect(findJoinUrl(["See https://docs.google.com/document/d/1 and https://aka.ms/JoinTeamsMeeting"])).toBeNull();
  });

  it("refuses look-alike hosts and plain http", () => {
    expect(findJoinUrl(["https://meet.google.com.evil.io/abc-defg-hij"])).toBeNull();
    expect(findJoinUrl(["https://evilzoom.us/j/123"])).toBeNull();
    expect(findJoinUrl(["http://meet.google.com/abc-defg-hij"])).toBeNull();
  });

  it("returns null for nothing", () => {
    expect(findJoinUrl([])).toBeNull();
    expect(findJoinUrl([undefined, "", "Conference room B"])).toBeNull();
  });
});
