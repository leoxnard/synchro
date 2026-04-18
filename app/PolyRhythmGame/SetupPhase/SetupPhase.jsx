import React, { useState } from 'react';

import DesktopSetupPhase from './SetupPhaseDesktop';
import MobileSetupPhase from './SetupPhaseMobile';

export default function SetupPhase(props) {
    const isTouchPreferred = Boolean(props.isTouchPreferred);

    if (isTouchPreferred) {
        return <MobileSetupPhase {...props} />;
    }

    return <DesktopSetupPhase {...props} />;
}
