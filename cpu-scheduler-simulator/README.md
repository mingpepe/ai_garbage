# CPU Scheduler Simulator: CFS & EEVDF

This project is a high-fidelity visual simulator for modern CPU scheduling algorithms used in the Linux kernel. It demonstrates the evolution from the **Completely Fair Scheduler (CFS)** to the newer **Earliest Eligible Virtual Deadline First (EEVDF)**.

## Key Concepts Demonstrated

### Completely Fair Scheduler (CFS)
- **$vruntime$ (Virtual Runtime):** Tasks are selected based on the lowest virtual runtime to ensure "fair" CPU distribution.
- **Nice Weights:** Nice values (-20 to 19) map to weights. A lower nice value gives a task a higher weight, causing its $vruntime$ to advance more slowly.
- **Dynamic Time Slices:** Time slices are calculated based on the task's weight relative to the total weight in the runqueue.
- **Red-Black Tree:** The runqueue is maintained as a Red-Black Tree, enabling efficient $O(\log N)$ task selection.
- **Wakeup Preemption:** When a task wakes up or a new task arrives with a significantly lower $vruntime$, it can preempt the currently running task.

### Earliest Eligible Virtual Deadline First (EEVDF)
- **Eligibility:** A task is "eligible" to run only if its $vruntime \le V(t)$, where $V(t)$ is the average virtual time of the system.
- **Virtual Deadline ($VD$):** Tasks request a specific "latency slice" ($r$). Their deadline is calculated as $VD = vruntime + \frac{r}{weight}$.
- **Earliest Deadline Selection:** Among all eligible tasks, the one with the earliest (lowest) $VD$ is chosen to run.
- **Immediate Preemption:** If an eligible task with a deadline earlier than the current task appears, it will preempt immediately.
- **Lag:** Tracks the difference between "what a task should have received" and "what it actually received".

## Interactive Features
- **Scenario Testing:** One-click setups to test fairness, weight differences, and preemption behaviors.
- **Dynamic Task Injection:** Add tasks with custom workloads, nice values, and latency requests while the simulation is running.
- **Sleep/Wake Control:** Manually toggle tasks between `READY` and `SLEEPING` to observe how the scheduler handles task re-entry and $vruntime$ placement.
- **Real-time Visualization:** 
  - **Gantt Chart:** Shows the execution timeline across multiple cores.
  - **Red-Black Tree View:** Displays the internal state of the runqueue.
  - **Task List:** Detailed metrics including $vruntime$, $Lag$, $VD$, and Eligibility.

## Technical Implementation
- **Tech Stack:** React, TypeScript, HTML5 Canvas (for Tree visualization).
- **Simulation Resolution:** $0.1\text{ms}$ ticks for accurate representation of small time slices and preemption thresholds.
- **Algorithms:** Implements core logic inspired by the Linux 6.6+ kernel scheduler.
