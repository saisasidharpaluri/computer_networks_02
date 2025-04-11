// DOM Elements
const packetCountInput = document.getElementById('packet-count');
const windowSizeInput = document.getElementById('window-size');
const timeoutDefaultRadio = document.getElementById('timeout-default');
const timeoutCustomRadio = document.getElementById('timeout-custom');
const timeoutSlider = document.getElementById('timeout-slider');
const timeoutValueSpan = document.getElementById('timeout-value');
const speedDefaultRadio = document.getElementById('speed-default');
const speedCustomRadio = document.getElementById('speed-custom');
const speedSlider = document.getElementById('speed-slider');
const speedValueSpan = document.getElementById('speed-value');
const errorModeSelect = document.getElementById('error-mode');
const errorRateContainer = document.getElementById('error-rate-container');
const errorRateSlider = document.getElementById('error-rate');
const errorRateValueSpan = document.getElementById('error-rate-value');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const resetBtn = document.getElementById('reset-btn');
const clearLogBtn = document.getElementById('clear-log');
const senderPacketsContainer = document.getElementById('sender-packets');
const receiverPacketsContainer = document.getElementById('receiver-packets');
const communicationChannel = document.getElementById('communication-channel');
const simulationLogContainer = document.getElementById('simulation-log');
const senderWindowIndicator = document.getElementById('sender-window-indicator');

// Simulation Configuration
let config = {
    packetCount: 10,
    windowSize: 4,
    timeout: 40000, // ms - increased from 7000 to 40000
    animationSpeed: 2, // increased from 1 to 2 for faster default animations
    errorMode: 'none',
    errorRate: 10 // %
};

// Simulation State
let state = {
    isRunning: false,
    isPaused: false,
    base: 0, // First packet in window
    nextSeq: 0, // Next packet to send
    expectedSeq: 0, // Next expected packet at receiver
    packets: [], // All packets
    timeoutTimers: {}, // Timeout timers for each packet
    animations: {}, // GSAP animations
    receivedPackets: {}, // Tracks packets received but not yet acknowledged
    processingAcks: false, // Flag to prevent multiple ACK processing at once
    pendingAcks: [], // Queue of ACKs waiting to be sent
    sendingPackets: false, // Flag to indicate we're in the process of sending window packets
    pendingPackets: [], // Queue of packets waiting to be sent in the current window
    pendingWindowProcessing: false, // Flag to indicate window processing is queued
    allPacketsSent: false, // Flag to indicate all packets in window have been sent
    waitingForAcks: false // Flag to indicate we're waiting for ACKs to be processed
};

// Initialize the UI
function initUI() {
    // Event Listeners for Inputs
    packetCountInput.addEventListener('change', () => {
        config.packetCount = parseInt(packetCountInput.value);
        resetSimulation();
    });

    windowSizeInput.addEventListener('change', () => {
        config.windowSize = parseInt(windowSizeInput.value);
        resetSimulation();
    });

    timeoutDefaultRadio.addEventListener('change', () => {
        if (timeoutDefaultRadio.checked) {
            timeoutSlider.disabled = true;
            config.timeout = 40000; // Updated default value
            timeoutValueSpan.textContent = '40000ms';
        }
    });

    timeoutCustomRadio.addEventListener('change', () => {
        if (timeoutCustomRadio.checked) {
            timeoutSlider.disabled = false;
        }
    });

    timeoutSlider.addEventListener('input', () => {
        const value = parseInt(timeoutSlider.value);
        config.timeout = value;
        timeoutValueSpan.textContent = `${value}ms`;
    });

    speedDefaultRadio.addEventListener('change', () => {
        if (speedDefaultRadio.checked) {
            speedSlider.disabled = true;
            config.animationSpeed = 1;
            speedValueSpan.textContent = '1x';
            updateAnimationSpeed();
        }
    });

    speedCustomRadio.addEventListener('change', () => {
        if (speedCustomRadio.checked) {
            speedSlider.disabled = false;
        }
    });

    speedSlider.addEventListener('input', () => {
        const value = parseFloat(speedSlider.value);
        config.animationSpeed = value;
        speedValueSpan.textContent = `${value}x`;
        updateAnimationSpeed();
    });

    errorModeSelect.addEventListener('change', () => {
        config.errorMode = errorModeSelect.value;
        if (config.errorMode === 'random') {
            errorRateContainer.style.display = 'block';
        } else {
            errorRateContainer.style.display = 'none';
        }
    });

    errorRateSlider.addEventListener('input', () => {
        const value = parseInt(errorRateSlider.value);
        config.errorRate = value;
        errorRateValueSpan.textContent = `${value}%`;
    });

    // Button Event Listeners
    startBtn.addEventListener('click', startSimulation);
    pauseBtn.addEventListener('click', togglePauseSimulation);
    resetBtn.addEventListener('click', resetSimulation);
    clearLogBtn.addEventListener('click', clearLog);

    // Initialize with default values
    resetSimulation();
    
    // Update timeout slider range to 100000ms
    timeoutSlider.setAttribute('min', '5000');
    timeoutSlider.setAttribute('max', '100000');
    timeoutSlider.setAttribute('step', '5000'); // Larger step size for easier adjustment
    timeoutSlider.value = 40000; // Set default value
    timeoutValueSpan.textContent = '40000ms'; // Update displayed value
}

// Update Animation Speed
function updateAnimationSpeed() {
    // Update all active GSAP animations
    for (const key in state.animations) {
        if (state.animations[key]) {
            state.animations[key].timeScale(config.animationSpeed);
        }
    }
}

// Log Entry Creation
function createLogEntry(message, type = 'info') {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    simulationLogContainer.appendChild(logEntry);
    simulationLogContainer.scrollTop = simulationLogContainer.scrollHeight;
    return logEntry;
}

// Clear Log
function clearLog() {
    simulationLogContainer.innerHTML = '';
    createLogEntry('Log cleared', 'info');
}

// Create Packet Element
function createPacketElement(seqNum, container, isAck = false) {
    const packet = document.createElement('div');
    packet.className = 'packet';
    packet.textContent = seqNum;
    packet.dataset.seqNum = seqNum;
    
    if (isAck) {
        packet.classList.add('ack-packet');
        packet.textContent = `ACK ${seqNum}`;
    }
    
    container.appendChild(packet);
    return packet;
}

// Create a packet in transit
function createPacketInTransit(seqNum, isAck = false) {
    const packet = document.createElement('div');
    packet.className = 'packet-in-transit';
    packet.dataset.seqNum = seqNum;
    
    if (isAck) {
        packet.classList.add('ack-packet');
        packet.textContent = `ACK ${seqNum}`;
    } else {
        packet.textContent = seqNum;
    }
    
    // Add click event for manual error mode
    if (config.errorMode === 'manual') {
        packet.style.cursor = 'pointer';
        packet.addEventListener('click', () => {
            if (state.isRunning && !state.isPaused) {
                try {
                    packet.classList.add('error-packet');
                    
                    // If this is a data packet (not ACK), it will be lost
                    if (!isAck) {
                        createLogEntry(`Packet ${seqNum} manually marked as error`, 'error');
                        
                        // Make sure the packet is marked as error in the state
                        if (seqNum < state.packets.length) {
                            state.packets[seqNum].error = true;
                            state.packets[seqNum].sent = true; // It was sent but errored
                            state.packets[seqNum].acknowledged = false; // Ensure it's not marked as acknowledged
                        }
                        
                        // Stop the animation safely
                        if (state.animations[`send${seqNum}`]) {
                            state.animations[`send${seqNum}`].kill();
                            delete state.animations[`send${seqNum}`];
                        }
                        
                        // Remove the packet after a short delay
                        setTimeout(() => {
                            try {
                                if (packet.parentNode) {
                                    packet.parentNode.removeChild(packet);
                                }
                                // Update visual status to show packet as errored
                                updatePacketStatusVisuals();
                                
                                // Resend only this packet, not the entire window
                                setTimeout(() => {
                                    if (state.isRunning && !state.isPaused && !state.packets[seqNum].acknowledged) {
                                        // Only reset this specific packet
                                        state.packets[seqNum].sent = false;
                                        state.packets[seqNum].error = false;
                                        
                                        // Send this packet again
                                        sendPacket(seqNum);
                                        createLogEntry(`Resending packet ${seqNum} after manual error`, 'info');
                                    }
                                }, 1000);
                            } catch (e) {
                                console.error("Error removing packet:", e);
                            }
                        }, 500);
                    } 
                    // If this is an ACK, it will be lost
                    else {
                        createLogEntry(`ACK ${seqNum} manually marked as error`, 'error');
                        
                        // Stop the animation safely
                        if (state.animations[`ack${seqNum}`]) {
                            state.animations[`ack${seqNum}`].kill();
                            delete state.animations[`ack${seqNum}`];
                        }
                        
                        // Remove the ACK after a short delay
                        setTimeout(() => {
                            try {
                                if (packet.parentNode) {
                                    packet.parentNode.removeChild(packet);
                                }
                                
                                // Trigger a timeout for the packet whose ACK was lost
                                // Note: in a proper Go-Back-N implementation, a lost ACK should
                                // eventually trigger a timeout for the base packet, not for this specific packet
                                if (state.isRunning && !state.isPaused && 
                                    !state.packets[state.base].acknowledged) {
                                    createLogEntry(`Triggering timeout for base packet ${state.base} due to lost ACK for packet ${seqNum}`, 'warning');
                                    handleTimeout(state.base);
                                }
                            } catch (e) {
                                console.error("Error removing ACK:", e);
                            }
                        }, 800);
                    }
                    
                    // Log the current state
                    logSimulationState();
                    
                } catch (e) {
                    console.error("Error in packet click handler:", e);
                }
            }
        });
    }
    
    return packet;
}

// Initialize Simulation
function initSimulation() {
    // Clear existing packets
    senderPacketsContainer.innerHTML = '';
    receiverPacketsContainer.innerHTML = '';
    communicationChannel.innerHTML = '';
    
    // Reset state
    state.base = 0;
    state.nextSeq = 0;
    state.expectedSeq = 0;
    state.packets = [];
    state.timeoutTimers = {};
    state.animations = {};
    state.receivedPackets = {}; // Reset received packets
    state.processingAcks = false;
    state.pendingAcks = []; // Reset pending ACKs
    state.sendingPackets = false; // Reset sending flag
    state.pendingPackets = []; // Reset pending packets
    state.pendingWindowProcessing = false; // Reset window processing flag
    state.allPacketsSent = false; // Reset sent flag
    state.waitingForAcks = false; // Reset waiting flag
    
    // Create packets at sender
    for (let i = 0; i < config.packetCount; i++) {
        const packet = createPacketElement(i, senderPacketsContainer);
        state.packets.push({
            seqNum: i,
            element: packet,
            sent: false,
            acknowledged: false,
            error: false
        });
    }
    
    // Create empty placeholders at receiver with proper horizontal positioning
    for (let i = 0; i < config.packetCount; i++) {
        const placeholder = document.createElement('div');
        placeholder.className = 'packet';
        placeholder.style.visibility = 'hidden';
        placeholder.dataset.seqNum = i;
        receiverPacketsContainer.appendChild(placeholder);
    }
    
    // Create vertical path indicators after all packets are placed
    setTimeout(() => {
        createVerticalPaths();
    }, 100);
    
    // Update visuals for the initial state
    updatePacketStatusVisuals();
    
    createLogEntry('Simulation initialized with ' + config.packetCount + ' packets and window size ' + config.windowSize, 'info');
    logSimulationState();
}

// Create vertical path indicators for each packet position
function createVerticalPaths() {
    // Clear existing paths
    const existingPaths = communicationChannel.querySelectorAll('.vertical-path');
    existingPaths.forEach(path => path.remove());
    
    // Create a path for each packet
    for (let i = 0; i < config.packetCount; i++) {
        const senderPacket = senderPacketsContainer.querySelector(`[data-seq-num="${i}"]`);
        if (!senderPacket) continue;
        
        const senderRect = senderPacket.getBoundingClientRect();
        const channelRect = communicationChannel.getBoundingClientRect();
        
        // Calculate center position
        const horizontalPosition = senderRect.left - channelRect.left + (senderRect.width / 2);
        
        // Create path element
        const pathElement = document.createElement('div');
        pathElement.className = 'vertical-path';
        pathElement.style.left = `${horizontalPosition}px`;
        pathElement.dataset.seqNum = i;
        
        communicationChannel.appendChild(pathElement);
    }
}

// Update Window Indicator
function updateWindowIndicator() {
    // Calculate positions
    const firstPacket = senderPacketsContainer.querySelector(`[data-seq-num="${state.base}"]`);
    
    // If the base is beyond the packet count (simulation complete), return
    if (state.base >= config.packetCount) {
        // Hide the window indicator
        senderWindowIndicator.style.display = 'none';
        return;
    }
    
    // Find the last packet in the window
    const windowEnd = Math.min(state.base + config.windowSize - 1, config.packetCount - 1);
    const lastPacket = senderPacketsContainer.querySelector(`[data-seq-num="${windowEnd}"]`);
    
    if (!firstPacket || !lastPacket) {
        senderWindowIndicator.style.display = 'none';
        return;
    }
    
    // Get positions
    const senderArea = document.querySelector('.sender-area');
    const firstRect = firstPacket.getBoundingClientRect();
    const lastRect = lastPacket.getBoundingClientRect();
    const senderRect = senderArea.getBoundingClientRect();
    
    // Calculate the position of the window indicator relative to the sender area
    const left = firstRect.left - senderRect.left;
    const top = firstRect.top - senderRect.top;
    const width = (lastRect.right - firstRect.left);
    const height = firstRect.height;
    
    // Position the window indicator
    senderWindowIndicator.style.left = left + 'px';
    senderWindowIndicator.style.top = top + 'px';
    senderWindowIndicator.style.width = width + 'px';
    senderWindowIndicator.style.height = height + 'px';
    
    // Make sure the window indicator is visible and has the right styles
    senderWindowIndicator.style.display = 'block';
    senderWindowIndicator.style.position = 'absolute';
    senderWindowIndicator.style.zIndex = '20';
    
    // Log window position for debugging
    console.log(`Window indicator: base=${state.base}, end=${windowEnd}, left=${left}, top=${top}, width=${width}, height=${height}`);
}

// Update shouldPacketFail to distinguish between packet and ACK failures
function shouldPacketFail(isAck = false) {
    if (config.errorMode === 'none') return false;
    if (config.errorMode === 'random') {
        // In random mode, only ACKs can fail, packets always reach the receiver
        if (!isAck) {
            return false; // Packets never fail
        }
        return Math.random() * 100 < config.errorRate; // Only ACKs can fail
    }
    return false; // Manual mode is handled by click events
}

// Update sendPacket to never fail packets in random mode
function sendPacket(seqNum) {
    // Safety checks
    if (seqNum >= config.packetCount) {
        console.error(`Invalid packet number: ${seqNum}`);
        state.sendingPackets = false;
        setTimeout(processPendingPackets, 100);
        return;
    }
    
    // Check if already acknowledged
    if (state.packets[seqNum].acknowledged) {
        console.log(`Packet ${seqNum} already acknowledged, skipping`);
        setTimeout(processPendingPackets, 100);
        return;
    }
    
    // Check if already sent and not errored
    if (state.packets[seqNum].sent && !state.packets[seqNum].error) {
        console.log(`Packet ${seqNum} already in transit, not resending`);
        setTimeout(processPendingPackets, 100);
        return;
    }
    
    // Will this packet have an error? (Always false in random mode for packets)
    const willFail = shouldPacketFail(false);
    
    // Create the visual packet in transit
    const transitPacket = createPacketInTransit(seqNum);
    communicationChannel.appendChild(transitPacket);
    
    // Calculate position
    const packetPath = communicationChannel.querySelector(`.vertical-path[data-seq-num="${seqNum}"]`);
    let horizontalPosition = 0;
    
    if (packetPath) {
        const pathStyle = window.getComputedStyle(packetPath);
        horizontalPosition = parseFloat(pathStyle.left);
    } else {
        const senderPacket = senderPacketsContainer.querySelector(`[data-seq-num="${seqNum}"]`);
        if (!senderPacket) {
            createLogEntry(`Error: Sender packet ${seqNum} not found`, 'error');
            setTimeout(processPendingPackets, 100);
            return;
        }
        
        const senderRect = senderPacket.getBoundingClientRect();
        const channelRect = communicationChannel.getBoundingClientRect();
        horizontalPosition = senderRect.left - channelRect.left + (senderRect.width / 2);
    }
    
    // Position the packet
    transitPacket.style.left = horizontalPosition + 'px';
    transitPacket.style.top = '0px';
    
    // Update state
    state.packets[seqNum].sent = true;
    state.packets[seqNum].error = false;
    updatePacketStatusVisuals();
    
    // Start timeout for this packet
    startTimeout(seqNum);
    
    createLogEntry(`Sending packet ${seqNum}`, 'info');
    
    // Create the animation
    const animationDuration = 3; // seconds
    const channelHeight = communicationChannel.offsetHeight;
    
    try {
        const animation = gsap.to(transitPacket, {
            top: channelHeight - transitPacket.offsetHeight,
            duration: animationDuration,
            ease: "none", // Linear movement
            onComplete: () => {
                delete state.animations[`send${seqNum}`];
                
                // If the packet was acknowledged during transit
                if (state.packets[seqNum].acknowledged) {
                    if (transitPacket.parentNode) {
                        transitPacket.parentNode.removeChild(transitPacket);
                    }
                    setTimeout(processPendingPackets, 500);
                    return;
                }
                
                // In random error mode, packets always reach the receiver
                // Packet successfully received
                if (transitPacket.parentNode) {
                    transitPacket.parentNode.removeChild(transitPacket);
                }
                receivePacket(seqNum);
            }
        });
        
        state.animations[`send${seqNum}`] = animation;
        animation.timeScale(config.animationSpeed);
    } catch (e) {
        console.error("Error creating animation:", e);
        if (transitPacket.parentNode) {
            transitPacket.parentNode.removeChild(transitPacket);
        }
        setTimeout(processPendingPackets, 500);
    }
}

// Modified Receive Packet function to collect ACKs properly
function receivePacket(seqNum) {
    if (seqNum === state.expectedSeq) {
        // Received in order
        createLogEntry(`Packet ${seqNum} received in order`, 'success');
        
        // Show packet at receiver
        const receiverPacket = receiverPacketsContainer.querySelector(`[data-seq-num="${seqNum}"]`);
        receiverPacket.style.visibility = 'visible';
        receiverPacket.textContent = seqNum;
        
        // Store this packet as received
        state.receivedPackets[seqNum] = true;
        
        // Update expected sequence
        state.expectedSeq++;
        
        // Queue this packet for acknowledgment
        if (!state.pendingAcks.includes(seqNum)) {
            state.pendingAcks.push(seqNum);
        }
        
        // If there are more pending packets to send, continue sending them first
        if (state.pendingPackets.length > 0) {
            // Continue sending from the window
            setTimeout(processPendingPackets, 500);
        } else {
            // All packets sent, check if we can process ACKs now
            state.sendingPackets = false;
            
            // If all packets in the window are sent, we can process ACKs
            if (allWindowPacketsSent()) {
                // Start processing ACKs only after ALL packets in window are sent
                setTimeout(() => {
                    checkAndProcessPendingAcks();
                }, 500);
            }
        }
    } else if (seqNum > state.expectedSeq) {
        // Out of order, discard
        createLogEntry(`Packet ${seqNum} received out of order, discarded`, 'warning');
        
        // Store that we received this packet (for Go-Back-N we don't use this but good for tracking)
        state.receivedPackets[seqNum] = true;
        
        // Queue a duplicate ACK for the last correctly received packet
        if (state.expectedSeq > 0) {
            const lastAck = state.expectedSeq - 1;
            if (!state.pendingAcks.includes(lastAck)) {
                state.pendingAcks.push(lastAck);
            }
            
            // Continue with next packet or ACK processing
            if (state.pendingPackets.length > 0) {
                // Continue sending from the window
                setTimeout(processPendingPackets, 500);
            } else if (allWindowPacketsSent()) {
                // Start processing ACKs
                setTimeout(() => {
                    checkAndProcessPendingAcks();
                }, 500);
            }
        } else {
            createLogEntry(`No packets received in order yet, cannot send ACK`, 'warning');
            
            // Continue with next packet if there are any
            if (state.pendingPackets.length > 0) {
                setTimeout(processPendingPackets, 500);
            } else {
                state.sendingPackets = false;
            }
        }
    } else {
        // Duplicate packet, discard
        createLogEntry(`Duplicate packet ${seqNum} received, discarded`, 'warning');
        
        // Queue an ACK for this packet
        if (!state.pendingAcks.includes(seqNum)) {
            state.pendingAcks.push(seqNum);
        }
        
        // Continue with next packet or ACK
        if (state.pendingPackets.length > 0) {
            setTimeout(processPendingPackets, 500);
        } else if (allWindowPacketsSent()) {
            // Start processing ACKs
            setTimeout(() => {
                checkAndProcessPendingAcks();
            }, 500);
        }
    }
}

// Modified function to strictly adhere to Go-Back-N protocol
function processNextPendingAck() {
    // If we're paused or not running, don't continue
    if (!state.isRunning || state.isPaused) return;
    
    // If we're still sending packets, don't process ACKs yet
    if (state.sendingPackets) {
        createLogEntry('Waiting for all packets to be sent before processing ACKs', 'info');
        return;
    }
    
    // If we're already processing ACKs, don't start again
    if (state.processingAcks) return;
    
    // If there are ACKs to send, send the next one
    if (state.pendingAcks.length > 0) {
        // Mark that we're processing ACKs
        state.processingAcks = true;
        
        const nextAck = state.pendingAcks.shift();
        createLogEntry(`Processing pending ACK for packet ${nextAck}`, 'info');
        sendAck(nextAck);
    } else {
        // No ACKs to send, check if we need to send more packets
        state.processingAcks = false;
        
        // If the simulation is still running and we have packets to send, start a new window processing
        if (state.isRunning && !state.isPaused && state.base < config.packetCount) {
            setTimeout(() => {
                if (state.isRunning && !state.isPaused) {
                    sendWindowPackets();
                }
            }, 500);
        }
    }
}

// Modified function for when ACK is lost to ensure proper window resending
function handleTimeout(seqNum) {
    createLogEntry(`Timeout for packet ${seqNum}, resending window`, 'warning');
    
    // Kill all packet animations
    for (const key in state.animations) {
        if (state.animations[key]) {
            state.animations[key].kill();
        }
    }
    state.animations = {};
    
    // Clear all pending ACKs since we're resetting the window
    state.pendingAcks = [];
    
    // Clear transit areas
    communicationChannel.innerHTML = '';
    
    // Recreate vertical paths after clearing the communication channel
    createVerticalPaths();
    
    // Reset send status for window packets
    for (let i = state.base; i < state.nextSeq; i++) {
        if (i < state.packets.length && !state.packets[i].acknowledged) {
            state.packets[i].sent = false;
            state.packets[i].error = false;
        }
    }
    
    // Reset nextSeq to base to ensure we start sending from the correct point
    state.nextSeq = state.base;
    
    // Update visuals
    updatePacketStatusVisuals();
    
    // Log the current state
    logSimulationState();
    
    // Reset packet sending flags to ensure we can start again
    state.sendingPackets = false;
    state.processingAcks = false;
    state.pendingWindowProcessing = false;
    state.waitingForAcks = false;
    state.allPacketsSent = false;
    
    // Queue up window packets for resending with a guaranteed continuation
    setTimeout(() => {
        if (state.isRunning && !state.isPaused) {
            // Use the regular window sending mechanism
            sendWindowPackets();
        }
    }, 500); // Increased delay to make the resend more visible
}

// Improved function to handle ACK failure scenarios
function sendAck(seqNum) {
    try {
        // Create ACK in transit
        const transitAck = createPacketInTransit(seqNum, true);
        communicationChannel.appendChild(transitAck);
        
        // Get the vertical path for this packet
        const packetPath = communicationChannel.querySelector(`.vertical-path[data-seq-num="${seqNum}"]`);
        let horizontalPosition = 0;
        
        if (packetPath) {
            // Get position from the path
            const pathStyle = window.getComputedStyle(packetPath);
            horizontalPosition = parseFloat(pathStyle.left);
        } else {
            // Fallback to calculated position using receiver packet
            const receiverPacket = receiverPacketsContainer.querySelector(`[data-seq-num="${seqNum}"]`);
            if (!receiverPacket) {
                // Handle case when receiver packet is not found
                createLogEntry(`Error: Receiver packet ${seqNum} not found`, 'error');
                if (transitAck.parentNode) {
                    transitAck.parentNode.removeChild(transitAck);
                }
                state.processingAcks = false; // Reset processing flag
                setTimeout(checkAndProcessPendingAcks, 500); // Continue processing other ACKs
                return;
            }
            const receiverRect = receiverPacket.getBoundingClientRect();
            const channelRect = communicationChannel.getBoundingClientRect();
            horizontalPosition = receiverRect.left - channelRect.left + (receiverRect.width / 2);
        }
        
        const channelHeight = communicationChannel.offsetHeight;
        
        // Position at receiver (bottom of channel)
        transitAck.style.left = horizontalPosition + 'px';
        transitAck.style.top = (channelHeight - transitAck.offsetHeight) + 'px';
        
        createLogEntry(`Sending ACK ${seqNum}`, 'info');
        
        // Will this ACK be lost? (In random mode, only ACKs can fail)
        const willFail = shouldPacketFail(true);
        
        // Animation with straight vertical path going upward
        const animationDuration = 3; // seconds
        
        // Create a vertical path animation for ACK going in the opposite direction
        const animation = gsap.to(transitAck, {
            top: 0,
            duration: animationDuration,
            ease: "none", // Linear movement
            onComplete: () => {
                // Animation completed
                try {
                    delete state.animations[`ack${seqNum}`];
                    
                    if (willFail) {
                        // ACK lost
                        if (transitAck.parentNode) {
                            transitAck.classList.add('error-packet');
                            createLogEntry(`ACK ${seqNum} lost in transmission`, 'error');
                            
                            setTimeout(() => {
                                try {
                                    if (transitAck.parentNode) {
                                        transitAck.parentNode.removeChild(transitAck);
                                    }
                                    
                                    // Reset the processing flag to allow other operations
                                    state.processingAcks = false;
                                    
                                    // Add this ACK back to the pending queue to try again later
                                    // This is critical - if ACK fails, we should try to send it again
                                    if (!state.pendingAcks.includes(seqNum)) {
                                        state.pendingAcks.unshift(seqNum); // Add to the beginning to prioritize it
                                    }
                                    
                                    // Only trigger timeout if this packet is the base packet and still isn't acknowledged
                                    if (state.isRunning && !state.isPaused && 
                                        seqNum === state.base && !state.packets[state.base].acknowledged) {
                                        // Start timeout for the base packet (Go-Back-N behavior)
                                        createLogEntry(`ACK for base packet ${state.base} was lost, will wait for timeout`, 'warning');
                                        
                                        // We don't trigger an immediate timeout, just let the natural timeout occur
                                        // This simulates the protocol better - the sender should wait for its own timeout
                                        
                                        // Process other pending ACKs if available
                                        setTimeout(() => {
                                            if (state.pendingAcks.length > 0 && !state.processingAcks) {
                                                processNextPendingAck();
                                            }
                                        }, 500);
                                    } else {
                                        // For non-base packets, just continue processing other ACKs
                                        setTimeout(() => {
                                            if (state.pendingAcks.length > 0 && !state.processingAcks) {
                                                processNextPendingAck();
                                            } else if (state.base < config.packetCount) {
                                                // If no more ACKs to process, check if we need to send more packets
                                                sendWindowPackets();
                                            }
                                        }, 500);
                                    }
                                } catch (e) {
                                    console.error("Error removing ACK:", e);
                                    state.processingAcks = false;
                                    // Continue processing
                                    setTimeout(checkAndProcessPendingAcks, 500);
                                }
                            }, 1000); // Shorter timeout for lost ACKs to speed up simulation
                        }
                    } else {
                        // ACK received successfully
                        try {
                            if (transitAck.parentNode) {
                                transitAck.parentNode.removeChild(transitAck);
                            }
                            receiveAck(seqNum);
                        } catch (e) {
                            console.error("Error receiving ACK:", e);
                            state.processingAcks = false;
                            setTimeout(processNextPendingAck, 500);
                        }
                    }
                } catch (e) {
                    console.error("Error in ACK animation completion:", e);
                    state.processingAcks = false;
                    setTimeout(processNextPendingAck, 500);
                }
            }
        });
        
        // Store animation reference
        state.animations[`ack${seqNum}`] = animation;
        animation.timeScale(config.animationSpeed);
    } catch (e) {
        console.error("Error in sendAck:", e);
        state.processingAcks = false;
        setTimeout(processNextPendingAck, 500);
    }
}

// Modified Receive ACK function to handle sequential processing
function receiveAck(seqNum) {
    createLogEntry(`ACK ${seqNum} received`, 'success');
    
    // Mark the received packet as acknowledged
    if (seqNum < state.packets.length) {
        // In Go-Back-N, we can only acknowledge a packet if it's the base packet 
        // or if all packets before it are already acknowledged
        if (seqNum == state.base) {
            // This is the base packet, we can acknowledge it
            state.packets[seqNum].acknowledged = true;
            state.packets[seqNum].error = false; // Clear any error status
            
            // Cancel timeout for this packet
            cancelTimeout(seqNum);
        } else if (seqNum > state.base) {
            // This is a future packet, check if all packets before it are acknowledged
            let canAcknowledge = true;
            for (let i = state.base; i < seqNum; i++) {
                if (!state.packets[i].acknowledged) {
                    canAcknowledge = false;
                    createLogEntry(`Cannot acknowledge packet ${seqNum} because packet ${i} is not yet acknowledged`, 'warning');
                    break;
                }
            }
            
            if (canAcknowledge) {
                // All previous packets are acknowledged, we can acknowledge this one
                state.packets[seqNum].acknowledged = true;
                state.packets[seqNum].error = false; // Clear any error status
                
                // Cancel timeout for this packet
                cancelTimeout(seqNum);
            } else {
                // We cannot acknowledge this packet yet, ignore the ACK
                createLogEntry(`ACK ${seqNum} received but ignored - waiting for previous packets to be acknowledged first`, 'warning');
                
                // Reset the processing flag and process next ACK if any
                state.processingAcks = false;
                setTimeout(processNextPendingAck, 500);
                return;
            }
        }
    }
    
    // Find the lowest unacknowledged packet to determine the new base
    let newBase = state.base;
    for (let i = state.base; i < state.packets.length; i++) {
        if (state.packets[i] && state.packets[i].acknowledged) {
            newBase = i + 1;
        } else {
            break; // Stop at the first unacknowledged packet
        }
    }
    
    // Update visuals for all packets
    updatePacketStatusVisuals();
    
    // Update base (slide window) if it has changed
    if (newBase > state.base) {
        // Store old base for logging
        const oldBase = state.base;
        
        // Update base to the lowest unacknowledged packet
        state.base = newBase;
        
        // Log window movement
        createLogEntry(`Window slides from packet ${oldBase} to packet ${state.base}`, 'info');
        
        // Log the current state
        logSimulationState();
        
        // Update the window indicator
        updateWindowIndicator();
    } else {
        // Even if base didn't change, log the current state for debugging
        createLogEntry(`Window remains at packet ${state.base}`, 'info');
        logSimulationState();
    }
    
    // Check if all packets are acknowledged
    if (state.base >= config.packetCount) {
        createLogEntry('All packets transmitted and acknowledged!', 'success');
        state.isRunning = false;
        startBtn.disabled = true;
        pauseBtn.disabled = true;
        state.processingAcks = false;
    } else {
        // Reset the processing flag to allow next ACK to be sent
        state.processingAcks = false;
        
        // Process next pending ACK if there is one
        if (state.pendingAcks.length > 0) {
            setTimeout(processNextPendingAck, 500);
        } else {
            // If all ACKs are processed and there are new packets potentially in the window,
            // check if we need to send more packets from the updated window
            state.pendingWindowProcessing = true;
            setTimeout(() => {
                state.pendingWindowProcessing = false;
                if (state.isRunning && !state.isPaused) {
                    sendWindowPackets();
                }
            }, 500);
        }
    }
}

// Modified Send Window Packets function to ensure proper sequencing
function sendWindowPackets() {
    // If we're already sending packets, don't start again
    if (state.sendingPackets) return;
    
    // If we're processing ACKs, don't start sending new packets
    if (state.processingAcks) return;
    
    // If we have pending ACKs, process them first before sending new packets
    if (state.pendingAcks.length > 0) {
        // Process ACKs first
        setTimeout(processNextPendingAck, 100);
        return;
    }
    
    const windowEnd = Math.min(state.base + config.windowSize, config.packetCount);
    
    // Calculate the current window size (for logging)
    const currentWindowSize = windowEnd - state.base;
    createLogEntry(`Current window: packets ${state.base} to ${windowEnd-1} (size: ${currentWindowSize})`, 'info');
    
    // Reset the pending packets queue
    state.pendingPackets = [];
    
    // Queue all packets in the window that haven't been acknowledged
    for (let i = state.base; i < windowEnd; i++) {
        // Only queue packets that need to be sent (not acknowledged)
        // Including those that were sent but had errors
        if (i < state.packets.length && !state.packets[i].acknowledged) {
            // Reset sent and error status for failed packets to resend them
            if (state.packets[i].error) {
                state.packets[i].sent = false;
                state.packets[i].error = false;
            }
            
            // Only add to queue if it hasn't been sent or had an error
            if (!state.packets[i].sent || state.packets[i].error) {
                state.pendingPackets.push(i);
            }
        }
    }
    
    // Log how many packets are queued
    if (state.pendingPackets.length > 0) {
        createLogEntry(`Queued ${state.pendingPackets.length} packets to send within the window`, 'info');
        
        // Start sending packets
        state.sendingPackets = true;
        processPendingPackets();
    } else {
        createLogEntry('No new packets to send in this window', 'info');
        state.sendingPackets = false;
        
        // Check if we've sent all packets in the window
        const allSent = allWindowPacketsSent();
        if (allSent) {
            createLogEntry('All packets in window have been sent. Ready for ACKs.', 'info');
        }
    }
}

// New helper function to check if all packets in the current window are sent
function allWindowPacketsSent() {
    const windowEnd = Math.min(state.base + config.windowSize, config.packetCount);
    
    for (let i = state.base; i < windowEnd; i++) {
        if (i < state.packets.length && !state.packets[i].acknowledged && !state.packets[i].sent) {
            return false;
        }
    }
    return true;
}

// Modified New function to process queued packets one at a time
function processPendingPackets() {
    // If we're paused or not running, don't continue
    if (!state.isRunning || state.isPaused) {
        state.sendingPackets = false;
        return;
    }
    
    // If we're processing ACKs, don't send new packets
    if (state.processingAcks) {
        state.sendingPackets = false;
        return;
    }
    
    // Mark that we're sending packets
    state.sendingPackets = true;
    
    // If there are packets to send, send the next one
    if (state.pendingPackets.length > 0) {
        const nextPacket = state.pendingPackets.shift();
        createLogEntry(`Sending next queued packet: ${nextPacket}`, 'info');
        sendPacket(nextPacket);
        
        // Update nextSeq if needed
        if (nextPacket >= state.nextSeq) {
            state.nextSeq = nextPacket + 1;
        }
    } else {
        // All packets in the window have been sent
        state.sendingPackets = false;
        createLogEntry('All packets in window have been sent, waiting for ACKs', 'info');
        
        // Check if we have pending ACKs to process now that all packets are sent
        checkAndProcessPendingAcks();
        
        // Set up a recovery check in case the simulation gets stuck
        setTimeout(checkAndRecoverSimulation, 5000);
    }
}

// Improved function to properly process ACKs after sending packets
function checkAndProcessPendingAcks() {
    // If there are no ACKs to process or we're already processing them, return
    if (state.pendingAcks.length === 0 || state.processingAcks) {
        // If no ACKs to process but simulation is still running and we're at the end of sending packets
        if (state.isRunning && !state.isPaused && !state.sendingPackets && state.base < config.packetCount) {
            // Check if all window packets have been sent
            if (allWindowPacketsSent()) {
                // Log this state - we've sent all packets but have no ACKs to process
                createLogEntry('All window packets sent but no ACKs to process. Waiting for timeouts or ACKs.', 'info');
                
                // Wait for potential ACKs or timeouts
                // We don't need to do anything else here as timeouts will trigger resends
            } else {
                // We still have packets to send in the window
                setTimeout(sendWindowPackets, 500);
            }
        }
        return;
    }
    
    // If all packets in window are sent, start processing ACKs
    if (allWindowPacketsSent()) {
        // Small delay to make the sequence more visible
        setTimeout(() => {
            if (!state.processingAcks) {
                createLogEntry('Starting to process ACKs now that all packets are sent', 'info');
                processNextPendingAck();
            }
        }, 500);
    }
}

// Start Timeout for a packet
function startTimeout(seqNum) {
    // Cancel existing timeout
    cancelTimeout(seqNum);
    
    // Don't start timeout for acknowledged packets
    if (state.packets[seqNum].acknowledged) {
        return;
    }
    
    // Log the timeout creation
    console.log(`Starting timeout for packet ${seqNum}, will expire in ${config.timeout}ms`);
    
    // Set new timeout
    state.timeoutTimers[seqNum] = setTimeout(() => {
        // Timeout occurred - add extra checks to ensure we should handle it
        if (state.isRunning && !state.isPaused && 
            !state.packets[seqNum].acknowledged && 
            seqNum >= state.base) {  // Only handle timeout if packet is in or after current window
            
            createLogEntry(`Timeout occurred for packet ${seqNum}`, 'warning');
            
            // Ensure the simulation is not in a stuck state
            state.sendingPackets = false;
            state.processingAcks = false;
            state.waitingForAcks = false;
            state.allPacketsSent = false;
            
            handleTimeout(seqNum);
        } else {
            // Log why we're not handling this timeout
            if (!state.isRunning) {
                console.log(`Timeout for packet ${seqNum} ignored - simulation not running`);
            } else if (state.isPaused) {
                console.log(`Timeout for packet ${seqNum} ignored - simulation paused`);
            } else if (state.packets[seqNum].acknowledged) {
                console.log(`Timeout for packet ${seqNum} ignored - packet already acknowledged`);
            } else if (seqNum < state.base) {
                console.log(`Timeout for packet ${seqNum} ignored - packet before current window base ${state.base}`);
            }
        }
    }, config.timeout);
}

// Cancel Timeout
function cancelTimeout(seqNum) {
    if (state.timeoutTimers[seqNum]) {
        console.log(`Cancelling timeout for packet ${seqNum}`);
        clearTimeout(state.timeoutTimers[seqNum]);
        delete state.timeoutTimers[seqNum];
    }
}

// Start Simulation
function startSimulation() {
    if (state.isRunning) {
        createLogEntry('Simulation already running', 'warning');
        return;
    }
    
    // Reset state flags to ensure clean start
    state.isRunning = true;
    state.isPaused = false;
    state.allPacketsSent = false;
    state.waitingForAcks = false;
    
    // Create the visual packet paths
    createVerticalPaths();
    
    // Disable input fields
    packetCountInput.disabled = true;
    windowSizeInput.disabled = true;
    timeoutDefaultRadio.disabled = true;
    timeoutCustomRadio.disabled = true;
    timeoutSlider.disabled = true;
    speedDefaultRadio.disabled = true;
    speedCustomRadio.disabled = true;
    speedSlider.disabled = true;
    errorModeSelect.disabled = true;
    errorRateSlider.disabled = true;
    
    // Enable pause button
    pauseBtn.disabled = false;
    
    createLogEntry('Starting simulation', 'info');
    
    // Start sending packets from the window
    sendWindowPackets();
}

// Toggle Pause
function togglePauseSimulation() {
    if (!state.isRunning) return;
    
    state.isPaused = !state.isPaused;
    pauseBtn.textContent = state.isPaused ? 'Resume' : 'Pause';
    
    if (state.isPaused) {
        createLogEntry('Simulation paused', 'info');
        
        // Pause all GSAP animations
        for (const key in state.animations) {
            if (state.animations[key]) {
                state.animations[key].pause();
            }
        }
    } else {
        createLogEntry('Simulation resumed', 'info');
        
        // Resume all GSAP animations
        for (const key in state.animations) {
            if (state.animations[key]) {
                state.animations[key].play();
            }
        }
        
        // Continue simulation flow based on current state
        if (state.waitingForAcks && state.pendingAcks.length > 0) {
            // Continue processing ACKs
            setTimeout(startProcessingAcks, 500);
        } else if (!state.waitingForAcks && !state.allPacketsSent) {
            // Continue sending packets
            setTimeout(() => {
                if (state.pendingPackets.length > 0) {
                    processPendingPackets();
                } else {
                    sendWindowPackets();
                }
            }, 500);
        }
    }
}

// Reset Simulation
function resetSimulation() {
    // Stop all animations
    for (const key in state.animations) {
        if (state.animations[key]) {
            state.animations[key].kill();
        }
    }
    
    // Clear all timeouts
    for (const key in state.timeoutTimers) {
        clearTimeout(state.timeoutTimers[key]);
    }
    
    // Reset state
    state.isRunning = false;
    state.isPaused = false;
    state.base = 0;
    state.nextSeq = 0;
    state.expectedSeq = 0;
    state.timeoutTimers = {};
    state.animations = {};
    state.sendingPackets = false;
    state.processingAcks = false;
    state.allPacketsSent = false;
    state.waitingForAcks = false;
    
    // Enable inputs
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    pauseBtn.textContent = 'Pause';
    
    packetCountInput.disabled = false;
    windowSizeInput.disabled = false;
    timeoutDefaultRadio.disabled = false;
    timeoutCustomRadio.disabled = false;
    
    // Only enable timeout slider if custom is selected
    timeoutSlider.disabled = !timeoutCustomRadio.checked;
    
    speedDefaultRadio.disabled = false;
    speedCustomRadio.disabled = false;
    
    // Only enable speed slider if custom is selected
    speedSlider.disabled = !speedCustomRadio.checked;
    
    errorModeSelect.disabled = false;
    errorRateSlider.disabled = errorModeSelect.value !== 'random';
    
    // Reinitialize the simulation
    initSimulation();
    
    createLogEntry('Simulation reset', 'info');
}

// Handle window resize to update vertical paths
window.addEventListener('resize', () => {
    if (!state.isRunning) {
        createVerticalPaths();
    }
});

// Initialize everything when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initUI();
});

// Update the visual status of all packets
function updatePacketStatusVisuals() {
    // Update all packet visuals based on their current state
    for (let i = 0; i < state.packets.length; i++) {
        const packetElement = senderPacketsContainer.querySelector(`[data-seq-num="${i}"]`);
        if (packetElement) {
            // Reset to default first
            packetElement.style.backgroundColor = '#3498db'; // Default blue
            
            // Apply appropriate styling based on status
            if (state.packets[i].acknowledged) {
                packetElement.style.backgroundColor = '#2ecc71'; // Green for acknowledged
            } else if (state.packets[i].error) {
                packetElement.style.backgroundColor = '#e74c3c'; // Red for error
            } else if (state.packets[i].sent) {
                packetElement.style.backgroundColor = '#f39c12'; // Orange for sent
            }
        }
    }
    
    // Update the window indicator
    updateWindowIndicator();
}

// Add a debug function to log the current state
function logSimulationState() {
    let stateStr = "Current state: ";
    stateStr += `Base=${state.base}, NextSeq=${state.nextSeq}, ExpectedSeq=${state.expectedSeq}, `;
    stateStr += "Packets=[";
    
    for (let i = 0; i < state.packets.length; i++) {
        if (i > 0) stateStr += ", ";
        stateStr += `${i}:`;
        if (state.packets[i].acknowledged) stateStr += "Ack";
        else if (state.packets[i].error) stateStr += "Err";
        else if (state.packets[i].sent) stateStr += "Sent";
        else stateStr += "Wait";
    }
    stateStr += "]";
    
    createLogEntry(stateStr, 'info');
}

// Add a function to recover simulation if it gets stuck
function checkAndRecoverSimulation() {
    // If simulation is running but not in a paused state
    if (state.isRunning && !state.isPaused) {
        // Check if we're not sending packets and not processing ACKs
        if (!state.sendingPackets && !state.processingAcks) {
            // Check if we have pending packets or ACKs
            if (state.pendingPackets.length > 0) {
                createLogEntry('Recovering simulation - continuing with pending packets', 'warning');
                processPendingPackets();
            } else if (state.pendingAcks.length > 0) {
                createLogEntry('Recovering simulation - processing pending ACKs', 'warning');
                processNextPendingAck();
            } else if (state.base < config.packetCount) {
                // We still have packets to send but nothing is pending
                createLogEntry('Recovering simulation - checking window for new packets', 'warning');
                sendWindowPackets();
            }
        }
    }
} 