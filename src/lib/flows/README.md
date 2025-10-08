# How does a Flow work?

A flow is state machine made of sequential steps, which works as follows:

1. Flow is initialized and `Flow.vue` is mounted
2. The first step is active and the component of the step itself is mounted
3. The lifecycle of step is executed leading the user to navigate each step
   of the flow. Each step has its own lifecycle
4. At any time, the flow can be cancel or the flow can be finished using the
   `cancel` or `done` hook respectively.

## State

The `state` of the flow is a singleton object per flow where all the input data
is stored. The keys of the state are the StepName and by default are the type of
string, although you can define your own complex types e.g. `PaymentRequestData`
where the QR data is an object with some properties.

### Error state

As well as the `state`, the flow has an `error` object. This object is used to
store the error of the flow. The error is set by `beforeNext` callback, and
invoking it will prevent the default behavior of the flow to go to the next
step. The error message will be passed down to the `main` component which it is
responsible for the rendering of the error message.

## Steps

A step is a JSON of type [`Step`](./steps.types.ts). You can read more about the
type in the definition type.

The flow system created follows the composability philosophy. Basically, you
define independent steps and each step can be either `InputStep` or `InfoStep`.

### `Input Step`

The step requires an input to be completed like a text input(e.g. pin code) or selecting an item from a list (e.g. tx list).

### `Info Step`

Step used to show only information to the user and the user is not required to do anything (e.g. onboarding points).

### Step lifecycle

1. The flow will activate the first step when it is open for the first time or
   the [`useCarousel`](../../composables/useCarousel.ts) will update the
   `activeStep` if the carousel slides
2. Once the step is activated, the `async` function `beforeRender(state)` will
   be triggered. Read more about this function [in the
   definition](./steps.types.ts)
3. The user can interact with the main component or the slide, and once the
   component emits the `done` event, the `beforeNext` will be triggered
4. The `beforeNext` is a hook that it's used to define validation of the step.
   It has some available callbacks to tell the flow what to do. By default, the
   callback `next` will be executed. Read more about this [callback in the type
   definition](./steps.types.ts)

> Note: The `main` component will receive always the same props like `state` or
> `isVisible`. Read the `Flow.vue` to see the props that are passed down to the
> `main` component. Also use the type `StepEmits` to see the events that the
> `main` component can emit to communicate with the flow.

## Flow

1. Make sure you define a `FlowName` and an object of type `Flow` in your app.
2. Then, you can use `initializeFlow` anywhere in the app.
   The function automatically will start the lifecycle of the Flow and open a modal

## Lifecycle of the Flow

```
┌──────┐   ┌──────┐  ┌──────┐   ┌──────┐
│Step 1├─► │Step 2├─►│Step 3├─► │Step 4│ This is an example of
└──────┘   └──────┘  └──────┘   └──────┘ steps in the flow.
```

1. `initializeFlow` will run the function with a signature of type `FlowInit`
2. It will setup mainly: name, steps and hooks a. As you can see, the flow is a
     sequential set of steps
3. A new model using the `modelController` from ionic will be created, which it
   will mount the `Flow.vue` component
4. While mounting the component, the composable `useCarousel` will be
   initialized and the component will render a carousel using `ul` and `li`
   elements with `CSS snap` properties. The carousel can be controlled using
   `goToSlide`, which will update `activeIndex`.
5. The first step of the flow will be marked as active
6. The active step is pushed to the `historyStack` and the component
7. Each step has its own lifecycle with also hooks. We explain them below.
8. At any time, a step can trigger `cancel` or `done` hook of the flow to
   finalize the flow. By default, clicking the cross icon will `cancel` the
   flow, and executing the last step lifecycle successfully will trigger `done`
   hook. You can read more about step lifecycle
   [here](./README.md#step-lifecycle). Using `err` inside the hook will prevent
   the flow to go to the next step.
9. When the last step is active, and the user wants to go to the next, the hook
   `done` will be triggered instead, since it does not have more steps ahead.

## Navigation of the flow

By default, the steps are defined in a linked list where each step is connected
to the next one. The first step to be active will be the first step of all.
After executing the `beforeNext` hook, the step will go to the next one.

### Jumping from one step to another and creating branches of the flow

```
       Step 2 ──►  Step 3
          ▲            │
          │<18         ▼
 User Age─┴────────► Step 4
            =>18
```

In the previous graph, the Step 1 might have two options. Depending on what the
age of the user, the flow will go to the Step 2 or Step 4.

To achieve this behavior you should have:

- Set the steps in a linked list: [Step 1, Step 2, Step 3, Step 4]. By doing this
  we have set up the default linked list flow. One step after the other.
- To define the link between step 1 to step 4 we would need to setup the
  `beforeNext` hook with the custom logic and using the callbacks.

For example:

```ts
// Make sure to set you StepName and FlowName
enum FlowName { UserSignUp = 'user_sign_up' }
enum StepName { UserAge = 'user_age', Step2 = 'step_2', Step3 = 'step_3', Step4 = 'step_4' }

// Steps definition
const userAgeStep: StepInit = async () => {
  const step: Step = {
    // Definition of the step title, description...
    beforeNext: async (state, { next, navigateTo /* prev */ }) => {
      // We control the branching here
      if (state.user_age < 18)
        next()
      else
        navigateTo(StepName.Step4) // You can use a relative index. In this case 3. Using negative index goes backwards. If you need to go one before, use prev() or navigateTo(-1)
    }
  }
}

// Nothing special
const step2: StepInit, step3: StepInit, step4: StepInit

const flow: FlowInit = async () => {
  return {
    // Definition of the flow
    steps: [userAgeStep(), step2(), step3(), step4()]
  }
}
```

#### How does it work

Basically, in `Flow.vue` we have the list of steps and a pointer. Calling `next`
or `prev` will move the pointer by 1. But if you use `navigateTo` callback, we will
compute the difference between the `active` step and the new step a move the
pointer accordingly. Therefore, `navigateTo` allows you to go to any step in any
direction.

> We assume that a step will be present only once. e.g. `userAgeStep` will never
> be defined twice in the array.

### The History Stack

Setting the array as a sequential list has its benefits like simpler API and not
many moving parts, it is just has a pointer that moves up and down.

But we have mainly a drawback: When user goes from one slide to another we want
a smooth transition. Meaning that if we are going from Step 1 to Step 4, we
don't want to show in the animation the Step 2 and Step 3.

We solve that by having another array of steps. This array of steps is just a
subset of the steps of the flow and it can never be bigger that the steps in the
flow.

Basically, this set of steps will only contain one element at the beginning, the
first step in the flow. Then, the function `navigateTo` in `Flow.vue` will be
executed:
- If the step is going forward, we will push the step into the stack
- If the step is going backward, we will:
   1. Eliminate the steps between the active and the new active
   2. Make an animation, going one slide previous
   3. The `activeIndex` has been updated. We will remove the previous activeStep
      from the historyStack
