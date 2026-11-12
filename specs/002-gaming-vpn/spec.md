# Feature Specification: Private Gaming VPN on the Existing EC2 Server

**Feature Branch**: `002-gaming-vpn` (spec directory; no branch created yet)

**Created**: 2026-11-06

**Status**: Draft

**Input**: User description: "So, lets keep this web application - on top of this I want to create VPN server on this ec2 VPS for my iranian friend so we can play games together"

## Overview

The EC2 instance that hosts Brain Harness (playground and MCP server) will also run a private VPN for a few invited people. The main user is the owner's friend in Iran, where the internet is heavily filtered: ordinary VPN protocols are often detected and blocked, and many game services refuse Iranian connections. The VPN has to work from inside Iran, carry real-time game traffic with low enough latency to play, and leave the existing web application running as it does today.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Friend in Iran connects and plays online (Priority: P1)

The owner sends the friend an invite (a link, file or QR code). The friend imports it into a VPN app on their device, connects, and from then on their game client reaches the game's servers and matchmaking as if the friend were outside Iran. The owner and the friend join the same lobby or party and play.

**Why this priority**: This is the reason for the feature. If the friend can't connect from Iran, or games don't work over the connection, nothing else matters.

**Independent Test**: From a network in Iran (or a network with equivalent filtering), import the invite, connect, check that the visible public address is the server's, then launch an online game, join the owner's party and play a full match.

**Acceptance Scenarios**:

1. **Given** the friend has received an invite, **When** they import it and press connect on a typical Iranian home or mobile connection, **Then** the connection is established within 30 seconds.
2. **Given** the friend is connected, **When** they check their public IP address or location, **Then** they see the server's address and region, not their Iranian one.
3. **Given** the friend is connected, **When** they launch an online game that blocks Iranian players, **Then** they can sign in, join matchmaking and play.
4. **Given** the friend is connected and in a match, **When** the game sends real-time traffic (including connectionless/UDP traffic), **Then** it is carried through the VPN and the match is playable without disconnects.

---

### User Story 2 - Web application keeps working unchanged (Priority: P1)

After the VPN is added, the Brain Harness playground and MCP endpoint still serve at the same address, and the GitHub Actions deploys still succeed without changes on the owner's side.

**Why this priority**: The owner explicitly wants to keep the web application. Adding the VPN must not break or slow it down.

**Independent Test**: With the VPN running and at least one client connected, open the playground, run a tool, call `/health`, and run both deploy workflows. All must succeed.

**Acceptance Scenarios**:

1. **Given** the VPN is running, **When** a visitor opens the playground URL, **Then** it loads and works as before.
2. **Given** the VPN is running, **When** a server or web-client deploy runs, **Then** it completes and the VPN keeps working without manual reconfiguration.
3. **Given** the instance reboots, **When** it comes back up, **Then** both the web application and the VPN are available again without manual steps.

---

### User Story 3 - Owner manages who has access (Priority: P2)

The owner can create an invite for a new person, see who is connected and how much data each person has used, and revoke a person's access at any time without affecting anyone else.

**Why this priority**: The server is the owner's, and its outbound data is billed to the owner. Access must stay limited to invited people, and the owner needs to be able to cut off a lost device or leaked invite.

**Independent Test**: Create two invites, connect with both, revoke one, and confirm that device can no longer connect while the other stays connected.

**Acceptance Scenarios**:

1. **Given** the owner wants to add someone, **When** they generate an invite, **Then** they get something they can send over a messenger (link, file or QR code) that works only for that person.
2. **Given** a person's access is revoked, **When** that person tries to connect, **Then** the connection is refused, and other people are not disconnected.
3. **Given** people have been using the VPN, **When** the owner checks usage, **Then** they see per-person connection status and data used in the current month.

---

### User Story 4 - Recovering when the connection gets blocked (Priority: P3)

Iranian filtering changes often. When the friend reports that the VPN has stopped working, the owner can follow a documented recovery procedure (for example, move to a different address or connection method) and send the friend an updated invite.

**Why this priority**: Blocking is likely to happen at some point. The VPN only stays useful long-term if there is a known way to recover.

**Independent Test**: Simulate a block of the current address or method, follow the recovery runbook, and confirm the friend can reconnect using only the updated invite.

**Acceptance Scenarios**:

1. **Given** the current connection method is blocked, **When** the owner follows the recovery runbook, **Then** a working connection is restored within 30 minutes of the owner starting.
2. **Given** a recovery changed the server's address or method, **When** the friend imports the updated invite, **Then** they can connect without any other changes on their device.

---

### User Story 5 - Owner and friend reach each other directly [NEEDS CLARIFICATION: Q1, is direct/LAN play between the two of you needed, or only online game servers?] (Priority: P3)

Both the owner and the friend connect to the VPN and can reach each other's devices directly, as if on the same local network. This is for games that use LAN play or one player hosting.

**Why this priority**: Only needed for LAN or self-hosted games. Most online games work with User Story 1 alone.

**Independent Test**: Connect both devices, start a LAN or hosted game on one, and join it from the other.

**Acceptance Scenarios**:

1. **Given** both players are connected, **When** one hosts a LAN or direct-connect game, **Then** the other can find or join it.
2. **Given** both players are connected, **When** one player's device sends traffic to the other's VPN address, **Then** it arrives, while devices of people who are not connected cannot reach either player.

### Edge Cases

- **Filtering escalates**: during national "internet shutdown" periods, when only domestic sites work, the VPN may not work at all. The runbook should say so, so nobody wastes time troubleshooting.
- **The server's address gets blocked**: AWS address ranges may be blocked in Iran. Recovery must allow moving to a new public address without rebuilding the server.
- **The friend switches networks** (home Wi-Fi ↔ mobile data): the client should reconnect on its own within about a minute.
- **Port conflicts with the web app**: if the VPN needs the HTTPS port (443) to look like normal web traffic, it must not break the web app, including the documented option of switching the web app to HTTPS later.
- **Large downloads** (game installs and updates are often 50–150 GB): this can produce a large AWS data bill. The owner needs to see usage and be able to limit it.
- **An invite leaks or a device is lost**: revoking that one invite must cut off that one device without affecting the others.
- **VPN users reaching the server itself**: connected people must not be able to reach the server's internal services (the Node process on port 3000, SSH, the management interface) through the VPN.
- **Games that ban VPNs or treat region changes as fraud**: some games flag sudden region changes. The VPN can't prevent this, and the runbook should warn about it.

## Requirements *(mandatory)*

### Functional Requirements

**Connectivity and censorship resistance**

- **FR-001**: The VPN MUST be reachable from Iranian home broadband and mobile networks at the time of deployment.
- **FR-002**: VPN traffic MUST look like ordinary encrypted web traffic to network filters, so that it is not identified and blocked as VPN traffic.
- **FR-003**: The VPN MUST carry both connection-oriented (TCP) and connectionless (UDP) traffic, because most online games need UDP for real-time play.
- **FR-004**: The VPN MUST send all of a connected person's internet traffic out through the server (full tunnel) by default, so game services see the server's region.
- **FR-005**: The VPN MUST NOT leak the person's real address through DNS lookups or IPv6 while connected.
- **FR-006**: Clients MUST reconnect on their own after a network change or a brief outage.

**Coexistence with the web application**

- **FR-007**: The Brain Harness playground, `/api`, `/health` and `/mcp` MUST keep working at their current address and port after the VPN is added.
- **FR-008**: The existing deploy workflows MUST keep working unchanged, and a deploy MUST NOT stop, reset or overwrite the VPN or its access list.
- **FR-009**: Both the VPN and the web application MUST start automatically after a reboot.
- **FR-010**: The VPN MUST NOT open any new route into the server's internal services (the Node process, SSH, the VPN management interface) for connected people.

**Access control and management**

- **FR-011**: Only invited people MUST be able to connect. Each person MUST get their own credentials.
- **FR-012**: The owner MUST be able to create a new invite in under 5 minutes, delivered as something a non-technical person can import (QR code, link or file).
- **FR-013**: The owner MUST be able to revoke one person's access without disconnecting or re-inviting the others.
- **FR-014**: The owner MUST be able to see each person's connection status and their data use for the current month.
- **FR-015**: The owner MUST be able to set a monthly data limit (per person or overall). When the limit is reached, that person's access pauses until the next month or until the owner raises it.
- **FR-016**: Any management interface MUST be reachable only by the owner, never publicly.

**Supported devices**

- **FR-017**: The friend MUST be able to connect from [NEEDS CLARIFICATION: see Q2, which devices does the friend play on?] using free, publicly available client apps that work in Iran.

**Documentation**

- **FR-018**: There MUST be a one-page guide for the friend: which app to install, how to import the invite, and how to check it works.
- **FR-019**: There MUST be an owner runbook covering adding and revoking people, checking usage, and recovering from a block (new address and/or new connection method).
- **FR-020**: The server setup MUST be documented well enough to rebuild the VPN on a fresh instance next to the web application.

**Direct play between players (conditional on Q1)**

- **FR-021**: If User Story 5 is in scope, connected people MUST be able to reach each other's devices directly, and only connected people can reach them.

### Key Entities

- **Person (VPN user)**: someone the owner invited, such as the friend or the owner. Has a display name, their own credentials, a status (active, paused, revoked), a monthly data limit and their monthly data use.
- **Invite**: what the owner sends a person to import into their client app. Belongs to one person. Contains everything the client needs to connect. Stops working when that person is revoked, and is replaced when the server address or method changes.
- **Server endpoint**: the public address and connection method clients use. It can change during block recovery, and changing it means sending updated invites.
- **Usage record**: data sent and received per person per month, used for the data limits and the owner's usage view.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The friend gets from receiving the invite to connected in under 10 minutes, following only the one-page guide and without help.
- **SC-002**: From Iran, connecting succeeds on at least 9 out of 10 attempts over a test week, outside national shutdown periods.
- **SC-003**: While connected, round-trip latency from the friend to European game servers adds no more than 50 ms compared with the direct path from the server's region, and the two can play a full 30-minute session without a VPN-caused disconnect.
- **SC-004**: The playground and `/health` respond normally 100% of the time during the VPN test week, and both deploy workflows pass.
- **SC-005**: Revoked access stops working within 1 minute.
- **SC-006**: Data use stays within the owner's monthly limit, and the owner can check usage in under 1 minute.
- **SC-007**: After a simulated block, a working connection is restored within 30 minutes by following only the runbook.

## Assumptions

- **Server**: the same EC2 instance as today (eu-north-1, Stockholm, Ubuntu). No second server. Stockholm is far enough from Iran for playable latency in most games, but not ideal for twitchy shooters.
- **Who uses it**: 2–5 people, the friend plus the owner and maybe a couple more. No scaling beyond that.
- **Ports**: the web app keeps port 80 (and 443 if switched to HTTPS later). The VPN may need its own ports, or may share 443 with the web app. Either way, the security group needs new inbound rules, which the owner will add.
- **Address stability**: the instance's public address is treated as changeable. Recovery may involve attaching an Elastic IP or swapping it.
- **Cost**: AWS charges for outbound data (roughly $0.09/GB beyond the free allowance). Gaming itself uses little data (~50–150 MB/hour), but game downloads can cost a lot, which is why FR-014 and FR-015 exist. The default overall limit is 100 GB/month.
- **Full tunnel**: the friend's web browsing also goes through the server while connected. A "games only" split tunnel is out of scope for v1.
- **No logging of what people do**: only per-person totals and connection times are kept, not the sites or games they visit.
- **Out of scope**: hosting game servers on the instance, console support via router setups (unless chosen in Q2), commercial or public VPN service, and any web UI for VPN management inside the Brain Harness playground.
- **Legal**: US sanctions rules generally allow personal communication and anti-censorship tools for people in Iran (OFAC General License D-2), and this is a private, non-commercial setup for a friend. Some games' terms forbid VPN use or region switching. That risk is the players' to accept.
