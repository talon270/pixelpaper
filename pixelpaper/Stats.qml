import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import Quickshell.Services.Mpris

// Samples system state every couple of seconds and exposes it as plain properties.
Item {
    id: root

    // CPU pressure (PSI "some avg10"): % of the last 10 s that some task waited for a CPU.
    // Unlike load %, one app pegging one core does not count; contention does.
    property real pressure: 0
    property real busyAbove: 25   // pause the drift above this…
    property real calmBelow: 10   // …resume below this (gap stops on/off flapping; idle is ~3)
    property bool busy: false
    property real mem: 0          // 0..1  RAM in use
    property real battery: -1     // 0..1, or -1 when the machine has no battery
    property int hour: clock.hours
    property int minute: clock.minutes

    signal tick()                 // fired after every sample, used to repaint live icons

    property bool _noBattery: false

    SystemClock { id: clock; precision: SystemClock.Minutes }

    // blockLoading makes reload() synchronous, so text() always returns fresh data.
    // These files are tiny, so blocking for a moment is harmless.
    FileView { id: psiFile; path: "/proc/pressure/cpu"; blockLoading: true }
    FileView { id: memFile; path: "/proc/meminfo"; blockLoading: true }
    FileView { id: hostFile; path: "/proc/sys/kernel/hostname"; blockLoading: true }
    FileView { id: kernelFile; path: "/proc/sys/kernel/osrelease"; blockLoading: true }
    FileView { id: uptimeFile; path: "/proc/uptime"; blockLoading: true }
    FileView {
        id: batFile
        path: "/sys/class/power_supply/BAT0/capacity"   // change to BAT1 etc. if needed
        blockLoading: true
        onLoadFailed: root._noBattery = true             // desktop: stop retrying every tick
    }

    function sample() {
        try {
            psiFile.reload();
            const m = psiFile.text().match(/some avg10=([\d.]+)/);
            if (m) {
                pressure = Number(m[1]);
                if (pressure > busyAbove) busy = true;
                else if (pressure < calmBelow) busy = false;
            }
        } catch (e) {}

        try {
            memFile.reload();
            const t = memFile.text();
            const total = Number(t.match(/MemTotal:\s+(\d+)/)[1]);
            const avail = Number(t.match(/MemAvailable:\s+(\d+)/)[1]);
            mem = 1 - avail / total;
        } catch (e) {}

        if (_noBattery) {
            battery = -1;
        } else {
            try {
                batFile.reload();
                const c = parseInt(batFile.text());
                battery = isNaN(c) ? -1 : c / 100;
            } catch (e) { battery = -1; }
        }

        tick();
    }

    // Live text for scenes, read once per scene.
    function words() {
        let uptime = "a while";
        try {
            uptimeFile.reload();
            const sec = Number(uptimeFile.text().split(" ")[0]);
            const d = Math.floor(sec / 86400), h = Math.floor(sec / 3600) % 24, m = Math.floor(sec / 60) % 60;
            uptime = d > 0 ? d + "d " + h + "h" : h > 0 ? h + "h " + m + "m" : m + " minutes";
        } catch (e) {}
        const players = Mpris.players.values;
        const player = players.find(p => p.isPlaying) || players[0];
        const workspaces = Hyprland.workspaces.values
            .filter(w => w.id > 0)
            .map(w => /^\d+$/.test(w.name) ? "Workspace " + w.name : w.name);
        return {
            host: hostFile.text().trim(),
            user: Quickshell.env("USER") || "",
            date: Qt.formatDate(new Date(), "ddd d MMM yyyy"),
            song: player ? player.trackTitle || "" : "",
            artist: player ? player.trackArtist || "" : "",
            kernel: kernelFile.text().trim().split("-")[0],
            uptime: uptime,
            mem: mem,
            battery: battery,
            workspaces: workspaces
        };
    }

    Timer {
        interval: 2000
        running: true
        repeat: true
        triggeredOnStart: true
        onTriggered: root.sample()
    }
}
