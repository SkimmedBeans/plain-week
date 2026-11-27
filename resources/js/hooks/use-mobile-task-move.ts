import { createContext, use } from 'react';

export const MobileTaskMoveContext = createContext({
    movingTasks: false,
    toggleMovingTasks: () => {},
});

export function useMobileTaskMove() {
    return use(MobileTaskMoveContext);
}
