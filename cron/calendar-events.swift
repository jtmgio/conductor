#!/usr/bin/env swift
// Reads today's calendar events via EventKit and outputs JSON
// Usage: swift calendar-events.swift [YYYY-MM-DD]

import EventKit
import Foundation

let store = EKEventStore()
let sem = DispatchSemaphore(value: 0)

// Parse optional date argument, default to today
let dateArg = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : nil
let df = DateFormatter()
df.dateFormat = "yyyy-MM-dd"
let targetDate: Date
if let arg = dateArg, let parsed = df.date(from: arg) {
    targetDate = parsed
} else {
    targetDate = Date()
}

store.requestFullAccessToEvents { granted, error in
    guard granted else {
        print("{\"error\": \"Calendar access denied. Grant access in System Settings > Privacy & Security > Calendars.\"}")
        sem.signal()
        return
    }

    let cal = Calendar.current
    let start = cal.startOfDay(for: targetDate)
    let end = cal.date(byAdding: .day, value: 1, to: start)!
    let pred = store.predicateForEvents(withStart: start, end: end, calendars: nil)
    let events = store.events(matching: pred)

    let timeFmt = DateFormatter()
    timeFmt.dateFormat = "HH:mm"

    var results: [[String: Any]] = []
    for e in events {
        // Skip all-day events (birthdays, holidays)
        if e.isAllDay { continue }

        var dict: [String: Any] = [
            "calendarName": e.calendar.title,
            "calendarAccount": e.calendar.source?.title ?? "",
            "title": e.title ?? "(no title)",
            "startTime": timeFmt.string(from: e.startDate),
            "endTime": timeFmt.string(from: e.endDate),
        ]

        // Attendees
        if let attendees = e.attendees {
            let names = attendees.compactMap { $0.name }.filter { !$0.isEmpty }
            if !names.isEmpty {
                dict["attendees"] = names
            }
        }

        // Location
        if let loc = e.location, !loc.isEmpty {
            dict["location"] = loc
        }

        // Notes
        if let notes = e.notes, !notes.isEmpty {
            dict["notes"] = String(notes.prefix(200))
        }

        results.append(dict)
    }

    let output: [String: Any] = [
        "date": df.string(from: targetDate),
        "events": results,
        "calendarCount": Set(results.map { $0["calendarName"] as? String ?? "" }).count,
    ]

    if let json = try? JSONSerialization.data(withJSONObject: output, options: [.sortedKeys]),
       let str = String(data: json, encoding: .utf8) {
        print(str)
    } else {
        print("{\"error\": \"Failed to serialize JSON\"}")
    }

    sem.signal()
}

sem.wait()
