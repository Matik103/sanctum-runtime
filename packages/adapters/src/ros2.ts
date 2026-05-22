/**
 * ROS2 adapter for Sanctum Runtime.
 *
 * For robotics / physical-world systems, Sanctum sits between the agent's
 * proposed command and the ROS2 publisher / service client. Most ROS2 nodes
 * expose actions through one of:
 *   - publishing a Twist / JointTrajectory message
 *   - calling a service (e.g. /move_base/goal)
 *   - sending a goal to an action server (rclnodejs ActionClient)
 *
 * This adapter wraps a generic "publish-or-call" function so the side effect
 * never reaches the robot until Sanctum has approved it. The blast radius
 * estimator already classifies physical-world actions as critical.
 */
import type { SanctumAdapterOptions } from './types.js'
import { gate } from './gate.js'
import { SanctumBlockedError, SanctumVerificationTimeoutError } from './errors.js'

/** Generic ROS2 publish/service-call signature. */
export type Ros2Dispatcher = (topic: string, payload: Record<string, unknown>) => Promise<unknown>

/**
 * Wrap a ROS2 dispatcher (publisher.publish, client.sendRequest, action
 * client.sendGoal) so every call passes through Sanctum first.
 *
 * Pass the ROS2 topic / service name as the `action` so Sanctum policies can
 * gate on specific topics (e.g. autoBlock `/cmd_vel` when blast=critical).
 *
 * @example
 * ```ts
 * import { wrapRos2Dispatcher } from '@sanctum-runtime/adapters'
 * const safePublish = wrapRos2Dispatcher(
 *   (topic, msg) => publisher.publish(msg),
 *   { client, agentId: 'ros2:nav_planner' },
 * )
 * await safePublish('/cmd_vel', { linear: { x: 0.5 } })
 * ```
 */
export function wrapRos2Dispatcher(
  dispatch: Ros2Dispatcher,
  options: SanctumAdapterOptions,
): Ros2Dispatcher {
  return async (topic, payload) => {
    await gate(
      {
        action: topic,
        params: payload,
        actor: options.agentId ?? 'ros2-agent',
        context: { physicalWorld: true, reversible: false },
      },
      options,
    )
    return dispatch(topic, payload)
  }
}

/**
 * Hook for ROS2 middleware layers (e.g. nav2 lifecycle hooks, behaviour
 * trees) — throws SanctumBlockedError if the proposed command should not run.
 */
export function createSanctumRos2Hook(options: SanctumAdapterOptions): {
  beforeCommand: (topicOrService: string, payload: Record<string, unknown>) => Promise<void>
} {
  return {
    async beforeCommand(topicOrService, payload) {
      await gate(
        {
          action: topicOrService,
          params: payload,
          actor: options.agentId ?? 'ros2-agent',
          context: { physicalWorld: true, reversible: false },
        },
        options,
      )
    },
  }
}

export { SanctumBlockedError, SanctumVerificationTimeoutError }
