import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { environment } from '@env/environment';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { AgentContext, AgentRunningState } from '@app/agents/agents.component';

export interface LLMCall {
  request: LlmRequest;
  response: LlmResponse;
  userPromptExpanded?: boolean;
  responseTextExpanded?: boolean;
}
export interface LlmRequest {
  id: number;
  userPromptText: string;
  systemPromptId: number;
  /** Hydrated from systemPromptId */
  systemPrompt?: SystemPrompt;

  variationSourceId?: number;
  variationNote?: string;
  /** Hydrated value from variationSourceId */
  variationSource?: LlmRequest;
}

export interface SystemPrompt {
  /** hash of the system prompt text */
  id: number;
  // description: string
  text: string;
  variationSourceId?: number;
  variationNote?: string;
  /** Hydrated value from variationSourceId */
  variationSource?: SystemPrompt;
}

export interface LlmResponse {
  /** UUID */
  id: string;
  llmRequestId: number;
  /** Hydrated from llmRequestId */
  llmRequest?: LlmRequest;
  /** From GenerateTextOptions.id */
  description: string
  /** Populated when called by an agent */
  agentId?: string;
  /** Populated when called by a user through the UI */
  userId?: string;
  responseText: string;
  callStack: string;
  /** LLM service/model identifier */
  llmId: string;
  /** Time of the LLM request */
  requestTime: number;
  /** Duration in millis until the first response from the LLM */
  firstResponse: number;
  /** Duration in millis for the full response */
  totalTime: number;
}

@Component({
  selector: 'app-agent',
  templateUrl: './agent.component.html',
  styleUrls: ['./agent.component.scss'],
})
export class AgentComponent implements OnInit {
  llmCalls: LLMCall[] = [];
  agentId: string | null = null;
  llmCallSystemPromptOpenState: boolean[] = [];
  llmCallFunctionCallsOpenState: boolean[] = [];
  llmCallMemoryOpenState: boolean[] = [];
  agentDetails: any = null;
  selectedTabIndex: number = 0;
  feedbackForm!: FormGroup;
  hilForm!: FormGroup;
  errorForm!: FormGroup;
  output: string | null = null;
  isSubmitting: boolean = false;

  userPromptExpanded: boolean = false;
  systemPromptExpanded: boolean = false;
  functionCallHistoryExpanded: boolean = false;
  memoryContentsExpanded: boolean = false;
  outputExpanded: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private formBuilder: FormBuilder,
    private snackBar: MatSnackBar,
    private router: Router,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    // Check if there's a tab name in the URL
    const fragment = this.route.snapshot.fragment;
    if (fragment) {
      const tabIndex = this.getTabIndexFromFragment(fragment);
      if (tabIndex !== -1) {
        this.selectedTabIndex = tabIndex;
      } else {
        this.selectedTabIndex = 0; // Default to the first tab if the fragment is invalid
      }
    } else {
      this.selectedTabIndex = 0; // Default to the first tab if no fragment is present
    }
    this.route.paramMap.pipe(map((params) => params.get('agentId'))).subscribe((agentId) => {
      this.agentId = agentId;
      if (agentId) {
        this.loadAgentDetails(agentId);
      }
      this.loadLlmCalls();
    });
    this.initializeFeedbackForm();
    this.initializeErrorForm();
    this.initializeHillForm();
  }

  private getTabNameFromIndex(index: number): string {
    switch (index) {
      case 0:
        return 'details';
      case 1:
        return 'memory';
      case 2:
        return 'function-calls';
      case 3:
        return 'llm-calls';
      default:
        return 'details';
    }
  }

  private getTabIndexFromFragment(fragment: string): number {
    switch (fragment) {
      case 'details':
        return 0;
      case 'memory':
        return 1;
      case 'function-calls':
        return 2;
      case 'llm-calls':
        return 3;
      default:
        return -1;
    }
  }

  onTabChange(index: number): void {
    this.selectedTabIndex = index;
    // Update the URL fragment with the current tab name
    const tabName = this.getTabNameFromIndex(index);
    this.router.navigate([], { fragment: tabName }).catch(console.error);
  }

  private initializeFeedbackForm(): void {
    this.feedbackForm = this.formBuilder.group({
      feedback: ['', Validators.required],
    });
  }

  private initializeHillForm(): void {
    this.hilForm = this.formBuilder.group({
      feedback: [''],
    });
  }

  private initializeErrorForm(): void {
    this.errorForm = this.formBuilder.group({
      errorDetails: ['', Validators.required],
    });
  }

  displayState(state: AgentRunningState): string {
    switch(state) {
      case 'agent':
        return 'Agent control loop';
      case 'functions':
        return 'Calling functions';
       case 'error':
         return 'Error';
        case 'hil':
          return 'Human-in-the-loop check';
        case 'feedback':
          return 'Agent requested feedback';
        case 'completed':
          return 'Completed'
        default:
          return state
    }
  }

  onResumeHil(): void {
    if (!this.hilForm.valid) return;
    this.isSubmitting = true;
    const feedback = this.hilForm.get('feedback')?.value;
    this.http
      .post(`${environment.serverUrl}/agent/v1/resume-hil`, {
        agentId: this.agentId,
        executionId: this.agentDetails.executionId,
        feedback,
      })
      .subscribe({
        next: (response) => {
          console.log('Agent resumed successfully:', response);
          this.loadAgentDetails(this.agentId!);
          this.isSubmitting = false;
          this.loadAgentDetails(this.agentId!);
        },
        error: (error) => {
          this.isSubmitting = false;
          console.error('Error resuming agent:', error);
          this.snackBar.open('Error resuming agent', 'Close', { duration: 3000 });
        },
      });
  }

  onResumeError(): void {
    if (!this.errorForm.valid) return;
    this.isSubmitting = true;
    const errorDetails = this.errorForm.get('errorDetails')?.value;
    this.http
      .post(`${environment.serverUrl}/agent/v1/resume-error`, {
        agentId: this.agentId,
        executionId: this.agentDetails.executionId,
        feedback: errorDetails,
      })
      .subscribe({
        next: (response) => {
          console.log('Agent resumed successfully:', response);
          this.loadAgentDetails(this.agentId!);
          this.isSubmitting = false;
          this.loadAgentDetails(this.agentId!);
        },
        error: (error) => {
          this.isSubmitting = false;
          console.error('Error resuming agent:', error);
          this.snackBar.open('Error resuming agent', 'Close', { duration: 3000 });
        },
      });
  }

  cancelAgent(): void {
    this.http
      .post(`${environment.serverUrl}/agent/v1/cancel`, {
        agentId: this.agentId,
        executionId: this.agentDetails.executionId,
        reason: 'None provided',
      })
      .subscribe({
        next: (response) => {
          console.log('Agent cancelled successfully:', response);
          this.loadAgentDetails(this.agentId!);
        },
        error: (error) => {
          console.error('Error cancelling agent:', error);
          this.snackBar.open('Error cancelling agent', 'Close', { duration: 3000 });
        },
      });
  }

  onSubmitFeedback(): void {
    if (!this.feedbackForm.valid) return;
    const feedback = this.feedbackForm.get('feedback')?.value;
    this.http
      .post(`${environment.serverUrl}/agent/v1/feedback`, {
        agentId: this.agentId,
        executionId: this.agentDetails.executionId,
        feedback: feedback,
      })
      .subscribe({
        next: (response) => {
          console.log('Feedback submitted successfully:', response);
          this.loadAgentDetails(this.agentId!);
          this.feedbackForm.reset();
        },
        error: (error) => {
          console.error('Error submitting feedback:', error);
          this.snackBar.open('Error submitting feedback', 'Close', { duration: 3000 });
        },
      });
  }

  loadLlmCalls(): void {
    if (this.agentId) {
      this.http.get<any>(`${environment.serverUrl}/llms/calls/agent/${this.agentId}`).subscribe(
        (calls) => {
          this.llmCalls = calls.data;
          this.llmCalls.forEach((call) => {
            call.request.userPromptText = call.request.userPromptText.replace('\\n', '<br/>');
            if (call.request.systemPrompt)
              call.request.systemPrompt.text = call.request.systemPrompt.text.replace('\\n', '<br/>');
          });
        },
        (error) => {
          console.error('Error loading LLM calls', error);
        }
      );
    }
  }

  removeFunctionCallHistory(text: string): string {
    return text.replace(/<function_call_history>.*?<\/function_call_history>/gs, '');
  }

  private loadAgentDetails(agentId: string): void {
    this.http.get<any>(`${environment.serverUrl}/agent/v1/details/${agentId}`).subscribe((details) => {
      this.agentDetails = details.data;
      this.output = null;
      if (this.agentDetails && this.agentDetails.state === 'completed') {
        // If the agent has been cancelled after an error then display the error
        // Otherwise display the Agent.completed argument
        const completed = this.agentDetails.functionCallHistory.slice(-1)[0];
        this.output = this.agentDetails.error ?? Object.values(completed.parameters);
      }
      // Initialize expanded states for stdout and stderr
      this.agentDetails.functionCallHistory.forEach((invoked: any) => {
        invoked.stdoutExpanded = false;
        invoked.stderrExpanded = false;
      });
    });
  }

  refreshAgentDetails(): void {
    if (this.agentId) {
      this.loadAgentDetails(this.agentId);
      this.loadLlmCalls();
    }
  }

  keys(obj: any) {
    return Object.keys(obj);
  }

  extractMemoryContent(text: string): string | null {
    const memoryContentRegex = /<memory>(.*?)<\/memory>/s;
    const match: RegExpExecArray | null = memoryContentRegex.exec(text);
    if (match && match[0]) {
      return match[0].trim();
    }
    return null;
  }

  removeMemoryContent(text: string): string {
    return text.replace(/<memory>.*?<\/memory>/gs, '');
  }

  extractFunctionCallHistory(text: string): string | null {
    const functionCallHistoryRegex = /<function_call_history>(.*?)<\/function_call_history>/s;
    const match = functionCallHistoryRegex.exec(text);
    if (match && match[1]) {
      return match[1].trim();
    }
    return null;
  }

  convertNewlinesToHtml(text: string): SafeHtml {
    text ??= '';
    // sanitize first?
    return this.sanitizer.bypassSecurityTrustHtml(text.replaceAll('\\n', '<br/>').replaceAll('\\t', '&nbsp;&nbsp;&nbsp;&nbsp;'));
  }

  agentUrl(agent: AgentContext): string {
    return `https://console.cloud.google.com/firestore/databases/${environment.firestoreDb || '(default)'}/data/panel/AgentContext/${agent.agentId}?project=${environment.gcpProject}`
  }

  llmCallUrl(llmResponse: LlmResponse): string {
    return `https://console.cloud.google.com/firestore/databases/${environment.firestoreDb || '(default)'}/data/panel/LlmResponse/${llmResponse.id}?project=${environment.gcpProject}`
  }

  traceUrl(agent: AgentContext): string {
    return `https://console.cloud.google.com/traces/list?referrer=search&project=${environment.gcpProject}&supportedpurview=project&pageState=(%22traceIntervalPicker%22:(%22groupValue%22:%22P1D%22,%22customValue%22:null))&tid=${agent.traceId}`
  }
}
